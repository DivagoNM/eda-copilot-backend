import type { PlacementRules } from '../../../types/pcb/layout-rules.ts';
import { MAX_BLOCK_COMPONENTS } from '../../placement-input.ts';
import { RETURN, SUPPLY, type CircuitComponent, type CircuitPin } from './context.ts';
import type { PcbSchematicGroups } from '../types.ts';

/** Authored families and assignments resolve ambiguous rail passives, never signal connectivity. */
export function createLocalEnvironment(ctx: {
    components: CircuitComponent[]; byDesignator: Map<string, CircuitComponent>;
    kindOf: (c: CircuitComponent) => string; functionOf: (c: CircuitComponent, p: CircuitPin) => string;
    hasFunction: (c: CircuitComponent, name: string) => boolean;
}, rules?: PlacementRules, schematicGroups?: PcbSchematicGroups) {
    const blocks = new Map(rules?.blocks.map(b => [b.name, b]) ?? []);
    const familyOf = new Map<string, string>();
    const familyByBlock = new Map<string, string>();
    const families = new Map<string, Set<string>>();
    for (const block of blocks.values()) {
        let root = block;
        const visited = new Set([root.name]);
        while (root.attachTo && blocks.has(root.attachTo) && !visited.has(root.attachTo)) {
            root = blocks.get(root.attachTo)!;
            visited.add(root.name);
        }
        familyByBlock.set(block.name, root.name);
        const members = families.get(root.name) ?? new Set<string>();
        for (const name of block.component_designators) { familyOf.set(name, root.name); members.add(name); }
        families.set(root.name, members);
    }
    for (const rule of rules?.component_rules ?? []) {
        const family = rule.block_name ? familyByBlock.get(rule.block_name) : undefined;
        if (family) { familyOf.set(rule.designator, family); families.get(family)!.add(rule.designator); }
    }
    const railNets = new Set<string>();
    const returnNets = new Set<string>();
    const railOwners = new Map<string, Set<string>>();
    for (const c of ctx.components) for (const pin of c.pins) {
        const fn = ctx.functionOf(c, pin);
        const power = SUPPLY.includes(fn) || ['VIN', 'PVIN', 'VCAP', 'VREG'].includes(fn) ||
            ctx.hasFunction(c, 'ldo') && ['IN', 'OUT', 'VOUT'].includes(fn);
        if (pin.signal_name && (power || RETURN.includes(fn) || fn === 'COM')) railNets.add(pin.signal_name);
        if (pin.signal_name && (RETURN.includes(fn) || fn === 'COM')) returnNets.add(pin.signal_name);
        if (pin.signal_name && power && !['capacitor', 'resistor', 'inductor', 'diode'].includes(ctx.kindOf(c))) {
            const owners = railOwners.get(pin.signal_name) ?? new Set<string>();
            owners.add(c.designator); railOwners.set(pin.signal_name, owners);
        }
    }
    const railPassive = (c: CircuitComponent) => ['capacitor', 'resistor', 'inductor'].includes(ctx.kindOf(c)) &&
        c.pins.length === 2 && c.pins.every(p => railNets.has(p.signal_name));
    const owners = new Map<string, Set<string>>();
    const assign = (passive: string, owner: string) => {
        const c = ctx.byDesignator.get(passive);
        const target = ctx.byDesignator.get(owner);
        if (!c || !target || !railPassive(c) || passive === owner || ['capacitor', 'resistor', 'inductor', 'diode'].includes(ctx.kindOf(target))) return;
        const assigned = owners.get(passive) ?? new Set<string>();
        assigned.add(owner); owners.set(passive, assigned);
    };
    for (const hint of rules?.hints ?? []) {
        if ((hint.relation === 'bypass' || hint.relation === 'cap_cluster') && hint.target) {
            for (const c of hint.capacitors) assign(c, hint.target.designator);
        } else if (hint.relation === 'near' || hint.relation === 'very_near' || hint.relation === 'cluster_with' || hint.relation === 'critical_pair') {
            if ((hint.source.type === 'component' || hint.source.type === 'pin') && (hint.target.type === 'component' || hint.target.type === 'pin')) {
                assign(hint.source.designator, hint.target.designator);
                assign(hint.target.designator, hint.source.designator);
            }
        }
    }
    for (const path of rules?.paths ?? []) for (const segment of path.segments) {
        assign(segment.source.designator, segment.target.designator);
        assign(segment.target.designator, segment.source.designator);
    }
    const inferred = new Map<string, Set<string>>(), ambiguous = new Set<string>();
    for (const island of schematicGroups?.incomplete ? [] : schematicGroups?.wireIslands ?? []) {
        const endpoints = island.pins.map(ref => {
            const component = ctx.byDesignator.get(ref.designator);
            const pin = component?.pins.find(p => String(p.pin_number) === String(ref.pin_number));
            return component && pin ? { component, pin } : undefined;
        });
        // Never shrink a disputed island or join separate islands by their net name.
        if (endpoints.length < 2 || endpoints.some(e => !e || !e.pin.signal_name)) continue;
        const valid = endpoints.filter(e => e !== undefined);
        const nets = new Set(valid.map(e => e.pin.signal_name));
        if (nets.size !== 1 || island.net !== null && !nets.has(island.net)) continue;
        if ([...nets].some(net => returnNets.has(net))) continue;
        const members = new Map(valid.map(e => [e.component.designator, e.component]));
        const anchors = [...members.values()].filter(c => !['capacitor', 'resistor', 'inductor', 'diode', 'connector', 'mounting-hole'].includes(ctx.kindOf(c)));
        const passives = [...members.values()].filter(railPassive);
        if (members.size > MAX_BLOCK_COMPONENTS || anchors.length !== 1) {
            for (const c of passives) ambiguous.add(c.designator);
            continue;
        }
        for (const c of passives) {
            const candidates = inferred.get(c.designator) ?? new Set<string>();
            candidates.add(anchors[0].designator); inferred.set(c.designator, candidates);
        }
    }
    const wireOwners = new Map([...inferred].filter(([name, candidates]) => candidates.size === 1 && !ambiguous.has(name))
        .map(([name, candidates]) => [name, [...candidates][0]]));
    const eligible = (c: CircuitComponent, anchor: string | string[]) => {
        if (!railPassive(c)) return true;
        const anchors = typeof anchor === 'string' ? [anchor] : anchor;
        const assigned = owners.get(c.designator);
        if (assigned?.size) return anchors.some(name => assigned.has(name));
        const wireOwner = wireOwners.get(c.designator);
        if (wireOwner) return anchors.includes(wireOwner);
        // A uniquely owned supply (such as VCAP) remains evidence across a wrong DSL boundary.
        if (!c.pins.some(p => (railOwners.get(p.signal_name)?.size ?? 0) > 1)) return true;
        const ownFamily = familyOf.get(c.designator);
        return !ownFamily || anchors.some(name => !familyOf.has(name) || ownFamily === familyOf.get(name));
    };
    const ordinaryTogether = (a: string, b: string) => {
        const family = familyOf.get(a);
        if (!family || family !== familyOf.get(b)) return false;
        const members = [...families.get(family)!].map(name => ctx.byDesignator.get(name)).filter(c => !!c);
        // A small dedicated family conveys ordinary locality; a board-sized group does not.
        return members.length <= MAX_BLOCK_COMPONENTS && members.filter(c => !['capacitor', 'resistor', 'inductor', 'diode', 'connector', 'mounting-hole'].includes(ctx.kindOf(c))).length === 1;
    };
    return { familyOf, families, railPassive, eligible, ordinaryTogether, wireOwners, assignedOwners: owners };
}

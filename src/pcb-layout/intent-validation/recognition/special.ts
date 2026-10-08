import { RETURN, SUPPLY, normalizeFunction, stableCompare, type CircuitPatternContext } from './context.ts';
import type { CircuitPatternDefinition, CircuitPatternMatch, CircuitPinRef, CircuitPatternRequirement } from './types.ts';
import { detectMemoryInterfaces } from './interfaces.ts';

const ref = (designator: string, pin_number: string | number): CircuitPinRef => ({ designator, pin_number });

export function detectSpecialPattern(ctx: CircuitPatternContext, definition: CircuitPatternDefinition): CircuitPatternMatch[] {
    if (definition.special === 'interface') return detectMemoryInterfaces(ctx);
    const matches: CircuitPatternMatch[] = [];
    const add = (components: string[], requirements: CircuitPatternRequirement[], evidence: CircuitPatternMatch['evidence'] = 'verified-profile') => {
        matches.push({ patternId: definition.id, components: [...new Set(components)].sort(stableCompare),
            roles: Object.fromEntries(components.map((c, i) => ['member' + i, c])), pins: {},
            nets: [...new Set(components.flatMap(c => ctx.byDesignator.get(c)?.pins.map(p => p.signal_name).filter(Boolean) ?? []))].sort(stableCompare),
            requirements, evidence });
    };
    if (definition.special === 'placement') {
        for (const component of ctx.components) {
            const placement = ctx.knowledge?.components?.[component.designator]?.placement;
            if (!placement || !definition.placementPurposes?.includes(placement.purpose)) continue;
            if (definition.placementFunctions?.some(fn => !ctx.hasFunction(component, fn))) continue;
            const requirements: CircuitPatternRequirement[] = [];
            if (placement.target && ctx.byDesignator.has(placement.target))
                requirements.push({ relation: 'near', source: component.designator, target: placement.target });
            for (const target of placement.avoid ?? []) if (ctx.byDesignator.has(target))
                requirements.push({ relation: 'away', source: component.designator, target, minDistance: placement.minDistance });
            if (placement.edge) requirements.push({ relation: 'edge', source: component.designator, edge: placement.edge });
            if (placement.rotations) requirements.push({ relation: 'rotation', source: component.designator, allowed: [...placement.rotations] });
            if (placement.keepout) requirements.push({ relation: 'keepout', source: component.designator, ...placement.keepout,
                ...(placement.keepout.layers ? { layers: [...placement.keepout.layers] } : {}),
                ...(placement.keepout.allowBlocks ? { allowBlocks: [...placement.keepout.allowBlocks] } : {}) });
            if (placement.alignment && placement.target) requirements.push({ relation: 'alignment', source: component.designator, target: placement.target, ...placement.alignment,
                ...(placement.alignment.offset ? { offset: { ...placement.alignment.offset } } : {}) });
            if (requirements.length) add([component.designator, ...requirements.flatMap(r => r.relation === 'near' || r.relation === 'away' ? [r.target] : [])], requirements);
        }
        return matches;
    }
    if (definition.special === 'isolation') {
        const isolation = ctx.knowledge?.isolation;
        if (!isolation) return matches;
        for (let a = 0; a < ctx.components.length; a++) for (let b = a + 1; b < ctx.components.length; b++) {
            const source = ctx.components[a].designator, target = ctx.components[b].designator;
            if (!isolation.domains[source] || !isolation.domains[target] || isolation.domains[source] === isolation.domains[target]) continue;
            add([source, target], [{ relation: 'away', source, target, minDistance: isolation.minClearance },
                { relation: 'separate-group', source, target }]);
        }
        return matches;
    }
    for (const component of ctx.components) {
        if (ctx.kindOf(component) === 'capacitor') continue;
        const declaredGroups = ctx.knowledge?.components?.[component.designator]?.supplyGroups;
        const supplies = component.pins.filter(pin => pin.signal_name && (SUPPLY.includes(ctx.functionOf(component, pin)) ||
            declaredGroups?.some(group => group.some(p => String(p) === String(pin.pin_number)))))
            .sort((a, b) => stableCompare(String(a.pin_number), String(b.pin_number)));
        const returns = new Set(component.pins.filter(pin => RETURN.includes(ctx.functionOf(component, pin))).map(pin => pin.signal_name));
        if (!supplies.length || !returns.size) continue;
        const capsFor = (net: string) => ctx.components.filter(c => ctx.kindOf(c) === 'capacitor' && c.pins.length === 2 &&
            c.pins.some(p => p.signal_name === net) && c.pins.some(p => returns.has(p.signal_name) && p.signal_name !== net));
        const rails = [...new Set(supplies.map(p => p.signal_name))].sort(stableCompare);
        if (definition.special === 'shared-supply' && !supplies.some(pin => ctx.components.some(other =>
            other.designator !== component.designator && other.pins.some(p => p.signal_name === pin.signal_name &&
                SUPPLY.includes(ctx.functionOf(other, p)))))) continue;
        const supplyFunctions = [...new Set(supplies.map(p => ctx.functionOf(component, p)))].sort(stableCompare);
        if (definition.special === 'supply-domains' && rails.length < 2 && supplyFunctions.length < 2) continue;
        if (definition.special === 'controller-bias' && (!supplyFunctions.includes('PVIN') ||
            !supplyFunctions.some(f => f === 'AVIN' || f === 'BIAS'))) continue;
        if (definition.special === 'bulk-local') {
            for (const rail of rails) {
                const caps = capsFor(rail);
                if (!caps.some(c => ctx.hasFunction(c, 'bulk-capacitor'))) continue;
                for (const cap of caps.filter(c => ctx.hasFunction(c, 'local-capacitor'))) {
                    const cp = cap.pins.find(p => p.signal_name === rail)!;
                    const targets = supplies.filter(p => p.signal_name === rail).map(p => ref(component.designator, p.pin_number));
                    const bulk = caps.filter(c => ctx.hasFunction(c, 'bulk-capacitor'));
                    add([component.designator, cap.designator, ...bulk.map(c => c.designator)], [
                        { relation: 'supply-group', targets, capacitors: [ref(cap.designator, cp.pin_number)] },
                        ...bulk.map(c => ({ relation: 'separate-group' as const, source: cap.designator, target: c.designator })),
                    ]);
                }
            }
            continue;
        }
        let groups: Array<Array<string | number>> | undefined;
        if (definition.special === 'supply-groups') {
            groups = ctx.knowledge?.components?.[component.designator]?.supplyGroups;
            if (!groups) {
                const footprint = ctx.footprints?.[component.designator];
                if (footprint) {
                    // A package side is not proof that supply pins can share one
                    // capacitor. Conservatively target each represented logical
                    // pin; adjacent pins may share a verified supplyGroups entry.
                    groups = supplies.filter(pin => footprint.pads.some(p => String(p.pin_number) === String(pin.pin_number)))
                        .map(pin => [pin.pin_number]);
                }
            }
            if (!groups || groups.length < 2) continue;
        } else if (definition.special === 'supply-domains' || definition.special === 'controller-bias') {
            groups = supplyFunctions.filter(f => definition.special !== 'controller-bias' || ['PVIN', 'AVIN', 'BIAS'].includes(f))
                .map(fn => supplies.filter(p => ctx.functionOf(component, p) === fn).map(p => p.pin_number));
        } else {
            groups = rails.map(rail => supplies.filter(p => p.signal_name === rail).map(p => p.pin_number));
        }
        for (const group of groups) {
            for (const rail of rails) {
                const targets = supplies.filter(p => p.signal_name === rail && group.some(n => String(n) === String(p.pin_number)))
                    .map(p => ref(component.designator, p.pin_number));
                if (!targets.length) continue;
                const caps = capsFor(rail);
                if (!caps.length) continue; // Missing circuit capacitance is outside placement-intent validation.
                const capacitors = caps.map(c => ref(c.designator, c.pins.find(p => p.signal_name === rail)!.pin_number));
                add([component.designator, ...caps.map(c => c.designator)], [{ relation: 'supply-group', targets, capacitors }],
                    definition.special === 'supply-groups' ? (declaredGroups ? 'verified-profile' : 'footprint') : 'connectivity');
            }
        }
    }
    return matches;
}

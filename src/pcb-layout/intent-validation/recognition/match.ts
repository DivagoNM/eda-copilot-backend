import { RETURN, pinKey, stableCompare, type CircuitComponent, type CircuitPatternContext, type CircuitPin } from './context.ts';
import type { CircuitPatternDefinition, CircuitPatternMatch } from './types.ts';
import { detectSpecialPattern } from './special.ts';

/** Exhaustive graph matching with net-index pruning, not destructive component claiming. */
export function matchCircuitPattern(context: CircuitPatternContext, definition: CircuitPatternDefinition): CircuitPatternMatch[] {
    if (definition.special) return detectSpecialPattern(context, definition);
    const nodes = definition.nodes ?? [];
    const links = definition.links ?? [];
    const roles: Record<string, string> = {};
    const selected: Record<string, { component: CircuitComponent; pin: CircuitPin }> = {};
    const matches: CircuitPatternMatch[] = [];
    function visit(index: number) {
        if (index === nodes.length) {
            const pins = Object.fromEntries(Object.entries(selected).map(([key, { component, pin }]) =>
                [key, { designator: component.designator, pin_number: pin.pin_number }]));
            matches.push({
                patternId: definition.id,
                components: Object.values(roles).sort(stableCompare),
                roles: { ...roles }, pins,
                nets: [...new Set(Object.values(selected).map(p => p.pin.signal_name))].sort(stableCompare),
                requirements: links.filter(l => l.local && pins[l.from] && pins[l.to]).map(l => ({ relation: 'local', source: pins[l.from], target: pins[l.to] })),
                evidence: nodes.some(n => n.functions?.length || context.knowledge?.components?.[roles[n.id]]?.kind ||
                    context.knowledge?.components?.[roles[n.id]]?.pinFunctions) ? 'verified-profile' : 'connectivity',
            });
            return;
        }
        const node = nodes[index];
        const before = matches.length;
        let candidates = context.candidates(node);
        // A link to an already assigned endpoint limits candidates to one electrical net.
        for (const link of links) {
            const own = link.from.startsWith(node.id + '.') ? link.from : link.to.startsWith(node.id + '.') ? link.to : undefined;
            const other = own === link.from ? link.to : link.from;
            if (!own || !selected[other]) continue;
            const designators = new Set((context.byNet.get(selected[other].pin.signal_name) ?? []).map(e => e.component.designator));
            candidates = candidates.filter(c => designators.has(c.designator));
        }
        for (const component of candidates) {
            if (Object.values(roles).includes(component.designator)) continue;
            roles[node.id] = component.designator;
            const entries = Object.entries(node.pins);
            function choosePin(i: number) {
                if (i === entries.length) {
                    if (links.some(l => selected[l.from] && selected[l.to] &&
                        selected[l.from].pin.signal_name !== selected[l.to].pin.signal_name)) return;
                    if (definition.differentNets?.some(([a, b]) => selected[a] && selected[b] &&
                        selected[a].pin.signal_name === selected[b].pin.signal_name)) return;
                    visit(index + 1);
                    return;
                }
                const [label, aliases] = entries[i];
                const key = node.id + '.' + label;
                for (const pin of context.pinsFor(component, aliases)) {
                    if (Object.entries(selected).some(([k, value]) => k.startsWith(node.id + '.') &&
                        String(value.pin.pin_number) === String(pin.pin_number))) continue;
                    // Different logical terminals on a motif component must be on distinct nets.
                    if (Object.entries(selected).some(([k, value]) => k.startsWith(node.id + '.') &&
                        value.pin.signal_name === pin.signal_name && !links.some(l =>
                            (l.from === k && l.to === key) || (l.to === k && l.from === key)))) continue;
                    selected[key] = { component, pin };
                    if (!links.some(l => selected[l.from] && selected[l.to] &&
                        selected[l.from].pin.signal_name !== selected[l.to].pin.signal_name)) choosePin(i + 1);
                    delete selected[key];
                }
            }
            choosePin(0);
            delete roles[node.id];
        }
        if (node.optional && before === matches.length) visit(index + 1);
    }
    visit(0);
    const unique = new Map<string, CircuitPatternMatch>();
    for (const match of matches) {
        const key = JSON.stringify([definition.id, Object.entries(match.pins).map(([role, p]) => {
            const component = context.byDesignator.get(p.designator)!;
            const pin = component.pins.find(pin => String(pin.pin_number) === String(p.pin_number))!;
            const fn = context.functionOf(component, pin);
            // Duplicate terminals with the same confirmed return function/net
            // are alternatives. Different ground domains/functions stay distinct.
            return [role, RETURN.includes(fn) ? [p.designator, fn, pin.signal_name] : pinKey(p.designator, p.pin_number)];
        })]);
        const prior = unique.get(key);
        if (!prior) { unique.set(key, match); continue; }
        match.requirements.forEach((requirement, index) => {
            const existing = prior.requirements[index];
            if (requirement.relation !== 'local' || existing.relation !== 'local') return;
            if (pinKey(existing.source.designator, existing.source.pin_number) === pinKey(requirement.source.designator, requirement.source.pin_number) &&
                pinKey(existing.target.designator, existing.target.pin_number) === pinKey(requirement.target.designator, requirement.target.pin_number)) return;
            const alternatives = existing.alternatives ?? [];
            const alternative = { source: requirement.source, target: requirement.target };
            if (!alternatives.some(a => JSON.stringify(a) === JSON.stringify(alternative))) alternatives.push(alternative);
            existing.alternatives = alternatives;
        });
    }
    return [...unique.values()].sort((a, b) => stableCompare(JSON.stringify(a.pins), JSON.stringify(b.pins)));
}

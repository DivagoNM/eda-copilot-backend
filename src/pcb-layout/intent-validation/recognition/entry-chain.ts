import { pinKey, stableCompare, RETURN, SUPPLY, type CircuitPatternContext } from './context.ts';
import type { CircuitPatternMatch, CircuitPinRef } from './types.ts';

/** Adds the explicitly declared side of protection; no protocol-wide placement assumption. */
export function withEntryChain(ctx: CircuitPatternContext, match: CircuitPatternMatch): CircuitPatternMatch {
    const choke = ctx.byDesignator.get(match.roles.choke);
    const chain = choke && ctx.knowledge?.components?.[choke.designator]?.entryChain;
    if (!choke || !chain || chain.connector !== match.roles.connector) return match;
    const receiver = ctx.byDesignator.get(chain.receiver);
    if (!receiver) return match;
    const pins = { ...match.pins }, requirements = [...match.requirements];
    const components = new Set(match.components);
    const add = (source: CircuitPinRef, target: CircuitPinRef, alternatives?: CircuitPinRef[]) => {
        components.add(target.designator);
        if (!requirements.some(r => r.relation === 'local' &&
            pinKey(r.source.designator, r.source.pin_number) === pinKey(source.designator, source.pin_number) &&
            pinKey(r.target.designator, r.target.pin_number) === pinKey(target.designator, target.pin_number)))
            requirements.push({ relation: 'local', source, target,
                ...(alternatives?.length ? { alternatives: alternatives.map(target => ({ source, target })) } : {}) });
    };
    for (const [branch, aliases] of [['P', ['IN+', 'RX+', 'DP']], ['N', ['IN-', 'RX-', 'DM']]] as const) {
        const output = pins['choke.out' + branch];
        const input = pins['choke.in' + branch];
        const outNet = choke.pins.find(p => String(p.pin_number) === String(output.pin_number))?.signal_name;
        const target = ctx.pinsFor(receiver, [...aliases]);
        if (target.length === 1 && target[0].signal_name === outNet) {
            const ref = { designator: receiver.designator, pin_number: target[0].pin_number };
            pins['receiver.' + branch] = ref; add(output, ref);
        }
        if (!chain.protection) continue;
        const protection = ctx.byDesignator.get(chain.protection.component);
        if (!protection) continue;
        const source = chain.protection.side === 'connector' ? input : output;
        const net = choke.pins.find(p => String(p.pin_number) === String(source.pin_number))?.signal_name;
        const targets = protection.pins.filter(p => p.signal_name === net &&
            ![...RETURN, ...SUPPLY].includes(ctx.functionOf(protection, p)))
            .sort((a, b) => stableCompare(String(a.pin_number), String(b.pin_number)));
        // An array's named functional or explicitly mapped terminals may be
        // repeated on the same line (flow-through package); each is an alternative.
        const refs = targets.map(target => ({ designator: protection.designator, pin_number: target.pin_number }));
        if (refs.length) add(source, refs[0], refs.slice(1));
    }
    return { ...match, pins, components: [...components].sort(stableCompare), requirements, evidence: 'verified-profile' };
}

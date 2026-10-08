import { pinKey, stableCompare, type CircuitPatternContext } from './context.ts';
import type { CircuitPatternMatch, CircuitPatternRequirement, CircuitPinRef } from './types.ts';

/** One unambiguous series resistor may separate the endpoint nets. */
export function interfacePinPairs(ctx: CircuitPatternContext, source: CircuitPinRef, target: CircuitPinRef): Array<{ source: CircuitPinRef; target: CircuitPinRef }> | undefined {
    const a = ctx.byDesignator.get(source.designator)?.pins.find(p => String(p.pin_number) === String(source.pin_number));
    const b = ctx.byDesignator.get(target.designator)?.pins.find(p => String(p.pin_number) === String(target.pin_number));
    if (!a?.signal_name || !b?.signal_name) return undefined;
    if (a.signal_name === b.signal_name) return [{ source, target }];
    const bridges = ctx.components.filter(c => c.designator !== source.designator && c.designator !== target.designator &&
        ctx.kindOf(c) === 'resistor' && c.pins.length === 2 && c.pins.some(p => p.signal_name === a.signal_name) && c.pins.some(p => p.signal_name === b.signal_name));
    if (bridges.length !== 1) return undefined;
    const resistor = bridges[0];
    return [{ source, target: { designator: resistor.designator, pin_number: resistor.pins.find(p => p.signal_name === a.signal_name)!.pin_number } },
        { source: { designator: resistor.designator, pin_number: resistor.pins.find(p => p.signal_name === b.signal_name)!.pin_number }, target }];
}

/** Confirmed bus endpoint maps are reusable by a future draft generator. */
export function detectMemoryInterfaces(ctx: CircuitPatternContext): CircuitPatternMatch[] {
    const matches: CircuitPatternMatch[] = [];
    const add = (source: string, target: string, pairs: Array<{ source: CircuitPinRef; target: CircuitPinRef }>, minimumPriority?: 'high' | 'critical') => {
        if (!pairs.length) return;
        const sorted = [...pairs].sort((a, b) => stableCompare(pinKey(a.source.designator, a.source.pin_number), pinKey(b.source.designator, b.source.pin_number)));
        const requirements: CircuitPatternRequirement[] = sorted.map(p => ({ relation: 'local', ...p, ...(minimumPriority ? { minimumPriority } : {}) }));
        const components = [...new Set(sorted.flatMap(p => [p.source.designator, p.target.designator]))].sort(stableCompare);
        matches.push({ patternId: 'qspi-flash', components,
            roles: { host: source, flash: target, ...Object.fromEntries(components.filter(c => c !== source && c !== target).map((c, i) => ['series' + i, c])) },
            pins: Object.fromEntries(sorted.flatMap((p, i) => [['source.' + i, p.source], ['target.' + i, p.target]])),
            nets: [...new Set(sorted.flatMap(p => [p.source, p.target]).map(p => ctx.byDesignator.get(p.designator)!.pins.find(pin => String(pin.pin_number) === String(p.pin_number))!.signal_name))].sort(stableCompare),
            requirements, evidence: 'verified-profile' });
    };
    for (const host of ctx.components) {
        for (const bus of ctx.knowledge?.components?.[host.designator]?.interfaces ?? []) {
            const flash = ctx.byDesignator.get(bus.peer);
            if (!flash) continue;
            const branches = bus.signals.map(signal => interfacePinPairs(ctx, { designator: host.designator, pin_number: signal.source },
                { designator: flash.designator, pin_number: signal.target }));
            // Do not silently validate a partial declared bus.
            if (branches.every((branch): branch is NonNullable<typeof branch> => !!branch))
                add(host.designator, flash.designator, branches.flat(), bus.minimumPriority);
        }
        for (const protocol of ['qspi', 'ospi'] as const) {
            if (!ctx.hasFunction(host, protocol + '-host')) continue;
            for (const flash of ctx.components.filter(c => c.designator !== host.designator && ctx.hasFunction(c, protocol + '-flash'))) {
                if (ctx.knowledge?.components?.[host.designator]?.interfaces?.some(bus => bus.peer === flash.designator)) continue;
                const aliases = [['CLK', 'SCK', 'SCLK', 'QSPI.CK', 'OSPI.CK'], ['CS', 'CS#', 'NCS'],
                    ...Array.from({ length: protocol === 'qspi' ? 4 : 8 }, (_, i) => ['IO' + i, 'DQ' + i, 'QSPI.IO' + i, 'OSPI.IO' + i])];
                const pairs = aliases.flatMap(names => {
                    const a = ctx.pinsFor(host, names), b = ctx.pinsFor(flash, names);
                    return a.length === 1 && b.length === 1 ? interfacePinPairs(ctx,
                        { designator: host.designator, pin_number: a[0].pin_number }, { designator: flash.designator, pin_number: b[0].pin_number }) ?? [] : [];
                });
                // A common named clock is the conservative core; identified data
                // and select endpoints add independent layout obligations.
                const clockA = ctx.pinsFor(host, aliases[0]), clockB = ctx.pinsFor(flash, aliases[0]);
                if (clockA.length === 1 && clockB.length === 1 && interfacePinPairs(ctx,
                    { designator: host.designator, pin_number: clockA[0].pin_number }, { designator: flash.designator, pin_number: clockB[0].pin_number }))
                    add(host.designator, flash.designator, pairs);
            }
        }
    }
    return matches;
}

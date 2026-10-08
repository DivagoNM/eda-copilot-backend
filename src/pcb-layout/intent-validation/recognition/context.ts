import type { ExplainCircuit } from '../../../types/circuit.ts';
import type { DetectCircuitPatternsInput, PatternNode } from './types.ts';
import { isMountingHoleComponent } from './mounting-holes.ts';

export type CircuitComponent = ExplainCircuit['components'][number];
export type CircuitPin = CircuitComponent['pins'][number];
export const normalizeFunction = (name: string) => name.toUpperCase().replace(/[\s_]/g, '');
export const pinKey = (designator: string, pin: string | number) => JSON.stringify([designator, String(pin)]);
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const stableCompare = compare;

export function createCircuitPatternContext(input: DetectCircuitPatternsInput) {
    const components = [...input.circuit.components].sort((a, b) => compare(a.designator, b.designator));
    const byDesignator = new Map(components.map(c => [c.designator, c]));
    const byNet = new Map<string, Array<{ component: CircuitComponent; pin: CircuitPin }>>();
    for (const component of components) for (const pin of component.pins) {
        if (!pin.signal_name) continue;
        const endpoints = byNet.get(pin.signal_name) ?? [];
        endpoints.push({ component, pin });
        byNet.set(pin.signal_name, endpoints);
    }
    const functionOf = (component: CircuitComponent, pin: CircuitPin) =>
        normalizeFunction(input.knowledge?.components?.[component.designator]?.pinFunctions?.[String(pin.pin_number)] ?? pin.name);
    const kindOf = (c: CircuitComponent): string => {
        const known = input.knowledge?.components?.[c.designator]?.kind;
        if (known) return known;
        if (isMountingHoleComponent(c, input)) return 'mounting-hole';
        const prefix = c.designator.match(/^[A-Za-z]+/)?.[0].toUpperCase();
        if (c.pins.length === 2) {
            if (prefix === 'R') return 'resistor';
            if (prefix === 'C') return 'capacitor';
            if (prefix === 'L') return 'inductor';
            if (prefix === 'D') return 'diode';
            if (prefix === 'Y' || prefix === 'X') return 'crystal';
        }
        if (prefix === 'J' || prefix === 'P' || prefix === 'CN') return 'connector';
        if (prefix === 'U' || prefix === 'IC') return 'ic';
        if (prefix === 'Q' && [['G', 'GATE'], ['S', 'SOURCE'], ['D', 'DRAIN']].every(names => c.pins.some(p => names.includes(functionOf(c, p))))) return 'mosfet';
        return 'unknown';
    };
    const hasFunction = (c: CircuitComponent, name: string) =>
        input.knowledge?.components?.[c.designator]?.functions?.includes(name) ?? false;
    const candidates = (node: PatternNode) => components.filter(c =>
        (!node.kind || kindOf(c) === node.kind || node.placementRole && input.componentRoles?.[c.designator] === node.placementRole &&
            !input.knowledge?.components?.[c.designator]?.kind) && (!node.kinds || node.kinds.includes(kindOf(c))) &&
        (node.pinCount === undefined || c.pins.length === node.pinCount) &&
        (!node.withoutPins || ![...c.pins.map(p => functionOf(c, p)),
            ...Object.values(input.knowledge?.components?.[c.designator]?.channels ?? {}).flatMap(channel => Object.keys(channel).map(normalizeFunction))]
            .some(fn => node.withoutPins!.map(normalizeFunction).includes(fn))) &&
        (!node.withoutFunctions || !node.withoutFunctions.some(f => hasFunction(c, f))) &&
        (!node.functions || node.functions.every(f => hasFunction(c, f))));
    const pinsFor = (c: CircuitComponent, aliases: string[]) => {
        if (aliases.includes('*')) return [...c.pins].filter(p => p.signal_name)
            .sort((a, b) => compare(String(a.pin_number), String(b.pin_number)));
        const names = aliases.map(normalizeFunction);
        const pins = c.pins.filter(p => p.signal_name && names.includes(functionOf(c, p)));
        // Ambiguous multi-channel names require an explicit channel-specific profile.
        return pins.length === 1 || names.every(name => RETURN.includes(name))
            ? [...pins].sort((a, b) => compare(String(a.pin_number), String(b.pin_number))) : [];
    };
    const pinSetsFor = (c: CircuitComponent, node: PatternNode): Record<string, CircuitPin[]>[] => {
        const entries = Object.entries(node.pins);
        const channels = Object.entries(input.knowledge?.components?.[c.designator]?.channels ?? {})
            .sort(([a], [b]) => compare(a, b))
            .map(([, channel]) => new Map(Object.entries(channel).map(([name, pin]) => [normalizeFunction(name), String(pin)])))
            .filter(channel => entries.some(([, aliases]) => aliases.some(alias => channel.has(normalizeFunction(alias)))));
        if (!channels.length) return [Object.fromEntries(entries.map(([label, aliases]) => [label, pinsFor(c, aliases)]))];
        return channels.map(channel => Object.fromEntries(entries.map(([label, aliases]) => {
            const names = aliases.map(normalizeFunction);
            const mapped = names.flatMap(name => channel.has(name) ? [channel.get(name)!] : []);
            const pins = mapped.length ? c.pins.filter(p => p.signal_name && mapped.includes(String(p.pin_number))) : pinsFor(c, aliases);
            return [label, [...pins].sort((a, b) => compare(String(a.pin_number), String(b.pin_number)))];
        })));
    };
    return { ...input, components, byDesignator, byNet, functionOf, kindOf, hasFunction, candidates, pinsFor, pinSetsFor };
}
export type CircuitPatternContext = ReturnType<typeof createCircuitPatternContext>;
export const SUPPLY = ['VDD', 'VCC', 'VDDIO', 'VDDA', 'VCORE', 'PVIN', 'AVIN', 'BIAS', 'VBAT'];
export const RETURN = ['GND', 'VSS', 'AGND', 'PGND', 'DGND', 'VEE'];

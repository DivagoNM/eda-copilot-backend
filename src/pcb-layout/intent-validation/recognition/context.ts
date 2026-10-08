import type { ExplainCircuit } from '../../../types/circuit.ts';
import type { DetectCircuitPatternsInput, PatternNode } from './types.ts';

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
        if (prefix === 'Q' && ['G', 'S', 'D'].every(name => c.pins.some(p => functionOf(c, p) === name))) return 'mosfet';
        return 'unknown';
    };
    const hasFunction = (c: CircuitComponent, name: string) =>
        input.knowledge?.components?.[c.designator]?.functions?.includes(name) ?? false;
    const candidates = (node: PatternNode) => components.filter(c =>
        (!node.kind || kindOf(c) === node.kind) && (!node.functions || node.functions.every(f => hasFunction(c, f))));
    const pinsFor = (c: CircuitComponent, aliases: string[]) => {
        if (aliases.includes('*')) return [...c.pins].filter(p => p.signal_name)
            .sort((a, b) => compare(String(a.pin_number), String(b.pin_number)));
        const names = aliases.map(normalizeFunction);
        const pins = c.pins.filter(p => p.signal_name && names.includes(functionOf(c, p)));
        // Ambiguous multi-channel names require an explicit channel-specific profile.
        return pins.length === 1 || names.every(name => RETURN.includes(name))
            ? [...pins].sort((a, b) => compare(String(a.pin_number), String(b.pin_number))) : [];
    };
    return { ...input, components, byDesignator, byNet, functionOf, kindOf, hasFunction, candidates, pinsFor };
}
export type CircuitPatternContext = ReturnType<typeof createCircuitPatternContext>;
export const SUPPLY = ['VDD', 'VCC', 'VDDIO', 'VDDA', 'VCORE', 'PVIN', 'AVIN', 'BIAS', 'VBAT'];
export const RETURN = ['GND', 'VSS', 'AGND', 'PGND', 'DGND', 'VEE'];

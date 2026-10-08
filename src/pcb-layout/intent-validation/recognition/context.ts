import type { ExplainCircuit } from '../../../types/circuit.ts';
import type { DetectCircuitPatternsInput, PatternNode } from './types.ts';
import { isMountingHoleComponent } from './mounting-holes.ts';

export type CircuitComponent = ExplainCircuit['components'][number];
export type CircuitPin = CircuitComponent['pins'][number];
export const normalizeFunction = (name: string) => name.toUpperCase().replace(/[\s_]/g, '');
export const pinKey = (designator: string, pin: string | number) => JSON.stringify([designator, String(pin)]);
export const stableCompare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const SUPPLY = ['VDD', 'VCC', 'VDDIO', 'VDDA', 'VCORE', 'PVIN', 'AVIN', 'BIAS', 'VBAT'];
export const RETURN = ['GND', 'VSS', 'AGND', 'PGND', 'DGND', 'VEE'];

/** Only schematic labels, named terminals and connectivity establish roles. */
export function createCircuitPatternContext(input: DetectCircuitPatternsInput) {
    const components = [...input.circuit.components].sort((a, b) => stableCompare(a.designator, b.designator));
    const byDesignator = new Map(components.map(c => [c.designator, c]));
    const byNet = new Map<string, Array<{ component: CircuitComponent; pin: CircuitPin }>>();
    for (const component of components) for (const pin of [...component.pins].sort((a, b) => stableCompare(String(a.pin_number), String(b.pin_number)))) {
        if (!pin.signal_name) continue;
        const endpoints = byNet.get(pin.signal_name) ?? [];
        endpoints.push({ component, pin }); byNet.set(pin.signal_name, endpoints);
    }
    const functionOf = (_component: CircuitComponent, pin: CircuitPin) => normalizeFunction(pin.name);
    const hasPins = (c: CircuitComponent, ...groups: string[][]) => groups.every(names => c.pins.some(p => names.includes(functionOf(c, p))));
    const labeled = (c: CircuitComponent, label: string) => [c.value, c.footprint_name, input.footprints?.[c.designator]?.name]
        .some(text => text && new RegExp('(?:^|[^a-z0-9])' + label.replace(/-/g, '[\\s_-]*') + '(?=$|[^a-z0-9])', 'i').test(text));
    const kindOf = (c: CircuitComponent): string => {
        if (input.componentRoles?.[c.designator] === 'connector') return 'connector';
        if (isMountingHoleComponent(c, input)) return 'mounting-hole';
        for (const kind of ['common-mode-choke', 'coupled-inductor', 'ethernet-magnetics', 'magjack', 'photodiode', 'optocoupler', 'current-source',
            'inductive-load', 'flyback-diode', 'transformer', 'balun', 'shunt', 'tvs', 'esd', 'igbt', 'connector']) if (labeled(c, kind)) return kind;
        if (hasPins(c, ['G', 'GATE'], ['S', 'SOURCE'], ['D', 'DRAIN'])) return 'mosfet';
        const prefix = c.designator.match(/^[A-Za-z]+/)?.[0].toUpperCase();
        if (c.pins.length === 2) {
            const passive: Record<string, string> = { R: 'resistor', C: 'capacitor', L: 'inductor', D: 'diode', Y: 'crystal', X: 'crystal' };
            if (prefix && passive[prefix]) return passive[prefix];
        }
        if (['J', 'P', 'CN'].includes(prefix ?? '')) return 'connector';
        if (['U', 'IC'].includes(prefix ?? '')) return 'ic';
        return 'unknown';
    };
    const hasFunction = (c: CircuitComponent, name: string): boolean => {
        if (labeled(c, name)) return true;
        // Candidate signatures are followed by the pattern's complete connectivity check.
        if (name === 'buck') return hasPins(c, ['SW', 'LX'], ['VIN', 'PVIN'], RETURN);
        if (name === 'boost' || name === 'sepic') return hasPins(c, ['SW', 'LX'], RETURN);
        if (name === 'buck-boost') return hasPins(c, ['SW1', 'LX1'], ['SW2', 'LX2']);
        if (name === 'ldo') return kindOf(c) === 'ic' && hasPins(c, ['IN', 'VIN'], ['OUT', 'VOUT'], RETURN) && !hasPins(c, ['SW', 'LX']);
        if (name === 'gate-driver') return kindOf(c) === 'ic' && hasPins(c, ['OUT', 'HO', 'LO', 'GATE'], ['IN', 'HIN', 'LIN', 'PWM']);
        if (name === 'current-sense') return hasPins(c, ['IN+', 'SENSE+', 'VIN+'], ['IN-', 'SENSE-', 'VIN-']);
        if (name === 'differential-input' || name === 'differential-return') return hasPins(c, ['IN+', 'RX+', 'DP'], ['IN-', 'RX-', 'DM']);
        if (name === 'rf' || name === 'rf-matching' || name === 'rf-endpoint') return hasPins(c, ['RF', 'RFIN', 'RFOUT', 'ANT']);
        if (name === 'ethernet-phy') return hasPins(c, ['TX+', 'TXP', 'TD+'], ['TX-', 'TXN', 'TD-']);
        if (name === 'qspi-host' || name === 'qspi-flash' || name === 'ospi-host' || name === 'ospi-flash')
            return hasPins(c, ['CLK', 'SCK', 'SCLK', 'QSPI.CK', 'OSPI.CK'], ['CS', 'CS#', 'NCS'],
                ...Array.from({ length: name.startsWith('ospi') ? 8 : 4 }, (_, i) => ['IO' + i, 'DQ' + i, 'QSPI.IO' + i, 'OSPI.IO' + i]));
        return false;
    };
    const candidates = (node: PatternNode) => components.filter(c =>
        (!node.kind || kindOf(c) === node.kind) && (!node.kinds || node.kinds.includes(kindOf(c))) &&
        (node.pinCount === undefined || c.pins.length === node.pinCount) &&
        (!node.withoutPins || !c.pins.some(p => node.withoutPins!.map(normalizeFunction).includes(functionOf(c, p)))) &&
        (!node.withoutFunctions || !node.withoutFunctions.some(f => hasFunction(c, f))) &&
        (!node.functions || node.functions.every(f => hasFunction(c, f))));
    const pinsFor = (c: CircuitComponent, aliases: string[]) => {
        const names = aliases.map(normalizeFunction);
        const pins = c.pins.filter(p => p.signal_name && (aliases.includes('*') || names.includes(functionOf(c, p))));
        return aliases.includes('*') || pins.length === 1 || names.every(name => RETURN.includes(name))
            ? [...pins].sort((a, b) => stableCompare(String(a.pin_number), String(b.pin_number))) : [];
    };
    return { ...input, components, byDesignator, byNet, functionOf, kindOf, hasFunction, candidates, pinsFor };
}
export type CircuitPatternContext = ReturnType<typeof createCircuitPatternContext>;

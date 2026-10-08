import assert from 'node:assert/strict';
import test from 'node:test';
import { detectCircuitPatterns, validatePcbLayoutIntent } from '../src/pcb.ts';
import type { CircuitPatternKnowledge, DetectCircuitPatternsInput } from '../src/pcb.ts';
import { circuitPatternRegistry } from '../src/pcb-layout/intent-validation/recognition/registry.ts';
import { pcbIntentPatternRegistry } from '../src/pcb-layout/intent-validation/registry.ts';

type Device = [string, string, string[]?, string?];
function fixture(...devices: Device[]): DetectCircuitPatternsInput {
    const knowledge: CircuitPatternKnowledge = { components: {} };
    return { circuit: { components: devices.map(([designator, connections, functions, kind]) => {
        if (functions || kind) knowledge.components![designator] = { functions, kind };
        return { designator, value: 'fixture', part_uuid: null, pins: connections.split(' ').map((pair, i) => {
            const [name, signal_name] = pair.split('=');
            return { pin_number: i + 1, name, signal_name };
        }) };
    }) }, knowledge };
}
// Independent, authored electrical examples. No fixture is generated from matcher definitions.
const cases: Record<string, DetectCircuitPatternsInput> = {
    'distributed-supply': fixture(['U1', 'VDD=v VDD=v GND=g'], ['C1', '1=v 2=g'], ['C2', '1=v 2=g']),
    'shared-rail-consumers': fixture(['U1', 'VDD=v GND=g'], ['U2', 'VDD=v GND=g'], ['C1', '1=v 2=g'], ['C2', '1=v 2=g']),
    'supply-domains': fixture(['U1', 'VDDA=va VDDIO=vd GND=g'], ['C1', '1=va 2=g'], ['C2', '1=vd 2=g']),
    'filtered-supply': fixture(['U1', 'VDD=filtered GND=g'], ['C1', '1=filtered 2=g'], ['R1', '1=raw 2=filtered', ['supply-filter']]),
    'bulk-local-caps': fixture(['U1', 'VDD=v GND=g'], ['C1', '1=v 2=g', ['bulk-capacitor']], ['C2', '1=v 2=g', ['local-capacitor']]),
    'controller-bias': fixture(['U1', 'PVIN=vp AVIN=va GND=g'], ['C1', '1=vp 2=g'], ['C2', '1=va 2=g']),
    'ldo-caps': fixture(['U1', 'IN=vi OUT=vo GND=g', ['ldo']], ['C1', '1=vi 2=g'], ['C2', '1=vo 2=g']),
    'internal-regulator-cap': fixture(['U1', 'VCAP=internal GND=g'], ['C1', '1=internal 2=g']),
    'buck-loop': fixture(['U1', 'VIN=vi SW=sw GND=g'], ['L1', '1=sw 2=vo'], ['C1', '1=vi 2=g'], ['D1', 'A=g K=sw']),
    'boost-loop': fixture(['U1', 'SW=sw GND=g', ['boost']], ['L1', '1=vi 2=sw'], ['D1', 'A=sw K=vo'], ['C1', '1=vo 2=g']),
    'buck-boost-loops': fixture(['U1', 'SW1=s1 SW2=s2 VIN=vi VOUT=vo GND=g', ['buck-boost']], ['L1', '1=s1 2=s2'], ['C1', '1=vi 2=g'], ['C2', '1=vo 2=g']),
    'sepic-loop': fixture(['U1', 'SW=sw GND=g', ['sepic']], ['L1', '1=vi 2=sw'], ['L2', '1=transfer 2=g'], ['C1', '1=sw 2=transfer'], ['D1', 'A=transfer K=vo']),
    'flyback-primary': fixture(['T1', 'PRI+=vi PRI-=drain', [], 'transformer'], ['Q1', 'G=gate S=g D=drain'], ['C1', '1=vi 2=g']),
    'flyback-secondary': fixture(['T1', 'SEC+=winding SEC-=return', [], 'transformer'], ['D1', 'A=winding K=vo'], ['C1', '1=vo 2=return']),
    'dc-feedback': fixture(['U1', 'FB=fb GND=g'], ['R1', '1=vo 2=fb'], ['R2', '1=fb 2=g']),
    'compensation': fixture(['U1', 'COMP=comp GND=g'], ['R1', '1=comp 2=rc'], ['C1', '1=rc 2=g']),
    'snubber': fixture(['Q1', 'G=gate S=g D=sw'], ['R1', '1=sw 2=rc'], ['C1', '1=rc 2=g']),
    'charge-pump': fixture(['U1', 'C+=cp C-=cm'], ['C1', '1=cp 2=cm']),
    'gate-resistor': fixture(['U1', 'OUT=drv', ['gate-driver']], ['R1', '1=drv 2=gate'], ['Q1', 'G=gate S=g D=sw']),
    'gate-split-resistors': fixture(['U1', 'OUT=drv', ['gate-driver']], ['R1', '1=drv 2=gate'], ['R2', '1=diodeOut 2=gate'], ['D1', 'A=drv K=diodeOut'], ['Q1', 'G=gate S=g D=sw']),
    'driver-return': fixture(['U1', 'OUT=drv COM=source', ['gate-driver']], ['R1', '1=drv 2=gate'], ['Q1', 'G=gate S=source D=sw']),
    'driver-decoupling': fixture(['U1', 'VDD=v COM=g', ['gate-driver']], ['C1', '1=v 2=g']),
    'bootstrap': fixture(['U1', 'BOOT=boot SW=sw'], ['C1', '1=boot 2=sw']),
    'parallel-gates': fixture(['U1', 'OUT=drv', ['gate-driver']], ['R1', '1=drv 2=g1'], ['R2', '1=drv 2=g2'], ['Q1', 'G=g1 S=source D=drain'], ['Q2', 'G=g2 S=source D=drain']),
    'miller-clamp': fixture(['U1', 'CLAMP=gate'], ['Q1', 'G=gate S=g D=sw']),
    'inductive-clamp': fixture(['M1', '1=high 2=low', [], 'inductive-load'], ['D1', 'A=low K=high', [], 'flyback-diode']),
    'opamp-feedback': fixture(['U1', 'OUT=out IN-=sum IN+=in'], ['R1', '1=out 2=sum']),
    'transimpedance': fixture(['U1', 'OUT=out IN-=sum IN+=in'], ['R1', '1=out 2=sum'], ['D1', 'A=bias K=sum', [], 'photodiode']),
    'instrumentation-gain': fixture(['U1', 'RG1=rg1 RG2=rg2'], ['R1', '1=rg1 2=rg2']),
    'differential-amplifier': fixture(['U1', 'OUT=out IN-=sum IN+=plus'], ['R1', '1=out 2=sum'], ['R2', '1=signalMinus 2=sum'], ['R3', '1=signalPlus 2=plus'], ['R4', '1=plus 2=g']),
    'active-filter': fixture(['U1', 'OUT=out IN-=out IN+=input', ['active-filter']], ['R1', '1=source 2=middle'], ['R2', '1=middle 2=input'], ['C1', '1=middle 2=out'], ['C2', '1=input 2=g']),
    'sar-input-filter': fixture(['U1', 'IN=input GND=g', ['adc']], ['R1', '1=source 2=input'], ['C1', '1=input 2=g']),
    'differential-adc-filter': fixture(['U1', 'IN+=plus IN-=minus GND=g', ['adc']], ['R1', '1=sourcePlus 2=plus'], ['R2', '1=sourceMinus 2=minus'], ['C1', '1=plus 2=minus']),
    'adc-reference': fixture(['U1', 'REF=ref GND=g', ['adc']], ['C1', '1=ref 2=g']),
    'reference-buffer': fixture(['U1', 'OUT=ref IN-=ref IN+=source', ['reference-buffer']], ['U2', 'REF=ref GND=g', ['adc']], ['C1', '1=ref 2=g']),
    'high-impedance-divider': fixture(['U1', 'IN=input GND=g', ['adc', 'high-impedance-input']], ['R1', '1=source 2=input'], ['R2', '1=input 2=g'], ['C1', '1=input 2=g']),
    'shunt-kelvin': fixture(['U1', 'IN+=high IN-=low', ['current-sense']], ['R1', '1=high 2=low', [], 'shunt']),
    'sense-input-filter': fixture(['U1', 'IN+=plus IN-=minus', ['current-sense']], ['R1', '1=sourcePlus 2=plus'], ['R2', '1=sourceMinus 2=minus'], ['C1', '1=plus 2=minus']),
    'crystal': fixture(['U1', 'OSCIN=xi OSCOUT=xo GND=g'], ['Y1', '1=xi 2=xo'], ['C1', '1=xi 2=g'], ['C2', '1=xo 2=g']),
    'active-oscillator': fixture(['U1', 'VDD=v GND=g OUT=clock', ['oscillator']], ['C1', '1=v 2=g'], ['U2', 'CLKIN=clock']),
    'source-termination': fixture(['U1', 'OUT=source', ['source-termination']], ['R1', '1=source 2=line']),
    'receiver-termination': fixture(['U1', 'IN=line VTT=ref', ['receiver-termination']], ['R1', '1=line 2=ref']),
    'pll-filter': fixture(['U1', 'CP=cp VTUNE=tune GND=g', ['pll']], ['R1', '1=cp 2=tune'], ['C1', '1=tune 2=g']),
    'qspi-flash': fixture(['U1', 'SCK=clock', ['qspi-host']], ['U2', 'SCK=clock', ['qspi-flash']]),
    'esd-entry': fixture(['J1', '1=line 2=g'], ['D1', 'IO=line GND=g', [], 'esd']),
    'common-mode-choke': fixture(['L1', 'IN+=p OUT+=po IN-=n OUT-=no', [], 'common-mode-choke'], ['J1', '1=p 2=n']),
    'ac-coupling-pair': fixture(['U1', 'TX+=p TX-=n', ['ac-coupling-source']], ['C1', '1=p 2=pc'], ['C2', '1=n 2=nc']),
    'ethernet-magnetics': fixture(['U1', 'TX+=p TX-=n', ['ethernet-phy']], ['T1', 'PHY+=p PHY-=n LINE+=lp LINE-=ln', [], 'ethernet-magnetics'], ['J1', '1=lp 2=ln']),
    'can-split-termination': fixture(['U1', 'CANH=h CANL=l GND=g', ['can-endpoint']], ['R1', '1=h 2=mid'], ['R2', '1=l 2=mid'], ['C1', '1=mid 2=g']),
    'rs485-termination': fixture(['U1', 'A=a B=b', ['rs485-endpoint']], ['R1', '1=a 2=b']),
    'usb-series-pair': fixture(['U1', 'DP=p DM=m', ['usb-series-required']], ['R1', '1=p 2=portP'], ['R2', '1=m 2=portM']),
    'repeated-port-protection': fixture(['J1', '1=p1'], ['D1', 'IO=p1', [], 'esd'], ['J2', '1=p2'], ['D2', 'IO=p2', [], 'esd']),
    'rf-matching': fixture(['U1', 'RF=rf GND=g', ['rf-matching']], ['L1', '1=rf 2=antenna', ['rf-series']], ['C1', '1=antenna 2=g', ['rf-shunt']]),
    'rf-balun': fixture(['U1', 'RF+=p RF-=n', ['rf']], ['T1', 'IN+=p IN-=n OUT=antenna', [], 'balun']),
    'antenna-region': fixture(['U1', 'RF=antenna']),
    'isolation-domains': fixture(['U1', 'VDD=v1 GND=g1'], ['U2', 'VDD=v2 GND=g2']),
    'opto-feedback': fixture(['U1', 'A=led K=g1 C=collector E=g2', [], 'optocoupler'], ['R1', '1=v1 2=led'], ['R2', '1=v2 2=collector']),
    'cold-junction': fixture(['U1', 'OUT=temp'], ['J1', '1=tc']),
    'temperature-placement': fixture(['U1', 'OUT=temp'], ['Q1', 'G=gate S=g D=sw']),
    'magnetic-sensor': fixture(['U1', 'OUT=angle'], ['M1', '1=mechanics']),
};
cases['distributed-supply'].knowledge!.components!.U1 = { supplyGroups: [[1], [2]] };
cases['antenna-region'].knowledge!.components!.U1 = { placement: { purpose: 'antenna', edge: 'right' } };
cases['isolation-domains'].knowledge!.isolation = { domains: { U1: 'primary', U2: 'secondary' }, minClearance: 5 };
cases['cold-junction'].knowledge!.components!.U1 = { placement: { purpose: 'cold-junction', target: 'J1' } };
cases['temperature-placement'].knowledge!.components!.U1 = { placement: { purpose: 'ambient-temperature', avoid: ['Q1'], minDistance: 10 } };
cases['magnetic-sensor'].knowledge!.components!.U1 = { placement: { purpose: 'magnetic-sensor', target: 'M1' } };

test('all 60 registered patterns have independent electrical/profile examples and checkers', () => {
    assert.equal(circuitPatternRegistry.length, 60);
    assert.deepEqual([...Object.keys(cases)].sort(), circuitPatternRegistry.map(p => p.id).sort());
    assert.deepEqual(pcbIntentPatternRegistry.map(p => p.id).sort(), circuitPatternRegistry.map(p => p.id).sort());
});
for (const [id, input] of Object.entries(cases)) {
    test(id + ': recognizes topology and reports missing intent without mutating input', () => {
        const original = structuredClone(input);
        const matches = detectCircuitPatterns(input);
        assert.ok(matches.some(m => m.patternId === id), 'missing recognition for ' + id);
        const code = 'block("fixture",' + JSON.stringify(input.circuit.components.map(c => c.designator)) + ',"generic",{allowDisconnected:true});';
        const diagnostics = validatePcbLayoutIntent({ ...input, code });
        assert.equal(diagnostics.filter(d => d.severity === 'error').length, 0, JSON.stringify(diagnostics));
        assert.ok(diagnostics.some(d => d.code === 'PCB_INTENT_' + id.replace(/-/g, '_').toUpperCase()), JSON.stringify(diagnostics));
        assert.deepEqual(input, original);
        const reversed = structuredClone(input);
        reversed.circuit.components.reverse().forEach(c => c.pins.reverse());
        assert.deepEqual(detectCircuitPatterns(reversed), matches, 'stable under input order');
        const definition = circuitPatternRegistry.find(p => p.id === id)!;
        if (!definition.special) {
            const disconnected = structuredClone(input);
            for (const c of disconnected.circuit.components) for (const p of c.pins) p.signal_name = c.designator + '.' + p.pin_number;
            assert.equal(detectCircuitPatterns(disconnected).some(m => m.patternId === id), false, 'shared connectivity is required');
        }
    });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { detectCircuitPatterns, validatePcbLayoutIntent } from '../src/pcb.ts';
import type { DetectCircuitPatternsInput } from '../src/pcb.ts';
import { circuitPatternRegistry } from '../src/pcb-layout/intent-validation/registry.ts';

type Device = [string, string, string[]?, string?];
// A catch-all board block must not count as a small dedicated functional family.
const boardWide = (input: DetectCircuitPatternsInput): DetectCircuitPatternsInput => ({ ...input,
    circuit: { components: [...input.circuit.components, { designator: 'U_GUARD', value: 'unrelated IC', part_uuid: null,
        pins: [{ pin_number: 1, name: 'UNUSED', signal_name: 'unrelated' }] }] } });
function fixture(...devices: Device[]): DetectCircuitPatternsInput {
    return { circuit: { components: devices.map(([designator, connections, functions, kind]) => {
        return { designator, value: [...(functions ?? []), ...(kind ? [kind] : [])].join(' ') || 'fixture', part_uuid: null, pins: connections.split(' ').map((pair, i) => {
            const [name, signal_name] = pair.split('=');
            return { pin_number: i + 1, name, signal_name };
        }) };
    }) } };
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
    'opto-feedback': fixture(['U1', 'A=led K=g1 C=collector E=g2', [], 'optocoupler'], ['R1', '1=v1 2=led'], ['R2', '1=v2 2=collector']),
    'connector-placement': fixture(['J1', '1=signal 2=g']),
    'mounting-holes': fixture(['U1', '1=signal']),
};

test('all registered patterns have independent schematic examples in a single registry', () => {
    assert.equal(circuitPatternRegistry.length, 57);
    assert.deepEqual([...Object.keys(cases)].sort(), circuitPatternRegistry.map(p => p.id).sort());
});
for (const [id, input] of Object.entries(cases)) {
    test(id + ': recognizes topology and reports missing intent without mutating input', () => {
        const original = structuredClone(input);
        const matches = detectCircuitPatterns(input);
        assert.ok(matches.some(m => m.patternId === id), 'missing recognition for ' + id);
        const validationInput = boardWide(input);
        const code = 'block("fixture",' + JSON.stringify(validationInput.circuit.components.map(c => c.designator)) + ',"generic",{allowDisconnected:true});';
        const diagnostics = validatePcbLayoutIntent({ ...validationInput, code });
        assert.equal(diagnostics.filter(d => d.severity === 'error').length, 0, JSON.stringify(diagnostics));
        assert.ok(diagnostics.some(d => d.code === 'PCB_INTENT_' + id.replace(/-/g, '_').toUpperCase()), JSON.stringify(diagnostics));
        assert.deepEqual(input, original);
        const reversed = structuredClone(input);
        reversed.circuit.components.reverse().forEach(c => c.pins.reverse());
        assert.deepEqual(detectCircuitPatterns(reversed), matches, 'stable under input order');
        const definition = circuitPatternRegistry.find(p => p.id === id)!;
        if (!definition.special && definition.links?.length) {
            const disconnected = structuredClone(input);
            for (const c of disconnected.circuit.components) for (const p of c.pins) p.signal_name = c.designator + '.' + p.pin_number;
            assert.equal(detectCircuitPatterns(disconnected).some(m => m.patternId === id), false, 'shared connectivity is required');
        }
    });
}

type PadPair = [string, number, string, number];
const expanded: Array<{ name: string; id: string; input: DetectCircuitPatternsInput; pairs: PadPair[] }> = [
    { name:'COMP series RC returns to FB',id:'compensation',input:fixture(
        ['U1','COMP=comp FB=fb GND=g'],['R1','1=comp 2=mid'],['C1','1=mid 2=fb']),
      pairs:[['U1',1,'R1',1],['R1',2,'C1',1],['C1',2,'U1',2]] },
    { name:'COMP direct capacitor returns to REF',id:'compensation',input:fixture(
        ['U1','COMP=comp REF=ref GND=g'],['C1','1=comp 2=ref']),
      pairs:[['U1',1,'C1',1],['C1',2,'U1',2]] },
    { name:'filtered two-terminal shunt sense',id:'shunt-kelvin',input:fixture(
        ['U1','IN+=filteredHigh IN-=filteredLow',['current-sense']],['R1','1=high 2=low',[],'shunt'],
        ['R2','1=high 2=filteredHigh'],['R3','1=low 2=filteredLow']),
      pairs:[['U1',1,'R2',2],['U1',2,'R3',2],['R2',1,'R1',1],['R3',1,'R1',2]] },
    { name:'filtered dedicated Kelvin shunt sense',id:'shunt-kelvin',input:fixture(
        ['U1','IN+=filteredHigh IN-=filteredLow',['current-sense']],['R1','FORCE+=high FORCE-=low SENSE+=high SENSE-=low',[],'shunt'],
        ['R2','1=high 2=filteredHigh'],['R3','1=low 2=filteredLow']),
      pairs:[['U1',1,'R2',2],['U1',2,'R3',2],['R2',1,'R1',3],['R3',1,'R1',4]] },
    { name:'Ethernet line termination chassis capacitor',id:'ethernet-magnetics',input:fixture(
        ['U1','TX+=p TX-=m',['ethernet-phy']],['T1','PHY+=p PHY-=m LINE+=lp LINE-=lm LINECT=ct',[],'ethernet-magnetics'],
        ['J1','1=lp 2=lm'],['R1','1=ct 2=chassisCap',['ethernet-line-termination']],['C1','1=chassisCap 2=chassis',['ethernet-chassis-cap']]),
      pairs:[['U1',1,'T1',1],['U1',2,'T1',2],['T1',3,'J1',1],['T1',4,'J1',2],['T1',5,'R1',1],['R1',2,'C1',1]] },
    { name: 'external synchronous buck half-bridge', id: 'buck-loop', input: fixture(
        ['U1','HG=hg LG=lg',['buck']],['Q1','G=hg S=sw D=vi'],['Q2','G=lg S=g D=sw'],['L1','1=sw 2=vo'],['C1','1=vi 2=g']),
      pairs: [['Q1',3,'C1',1],['Q1',2,'Q2',3],['Q1',2,'L1',1],['Q2',2,'C1',2]] },
    { name: 'external asynchronous buck', id: 'buck-loop', input: fixture(
        ['U1','OUT=gate',['buck']],['Q1','G=gate S=sw D=vi'],['D1','A=g K=sw'],['L1','1=sw 2=vo'],['C1','1=vi 2=g']),
      pairs: [['Q1',3,'C1',1],['Q1',2,'D1',2],['Q1',2,'L1',1],['D1',1,'C1',2]] },
    { name: 'external boost switch', id: 'boost-loop', input: fixture(
        ['U1','OUT=gate',['boost']],['Q1','G=gate S=g D=sw'],['L1','1=vi 2=sw'],['D1','A=sw K=vo'],['C1','1=vo 2=g']),
      pairs: [['Q1',3,'L1',2],['Q1',3,'D1',1],['D1',2,'C1',1],['Q1',2,'C1',2]] },
    { name: 'external four-switch buck-boost', id: 'buck-boost-loops', input: fixture(
        ['U1','HG1=h1 LG1=l1 HG2=h2 LG2=l2',['buck-boost']],['Q1','G=h1 S=s1 D=vi'],['Q2','G=l1 S=g D=s1'],
        ['Q3','G=h2 S=s2 D=vo'],['Q4','G=l2 S=g D=s2'],['L1','1=s1 2=s2'],['C1','1=vi 2=g'],['C2','1=vo 2=g']),
      pairs: [['Q1',3,'C1',1],['Q1',2,'Q2',3],['Q1',2,'L1',1],['Q2',2,'C1',2],['Q3',3,'C2',1],['Q3',2,'Q4',3],['Q3',2,'L1',2],['Q4',2,'C2',2]] },
    { name: 'coupled-inductor SEPIC', id: 'sepic-loop', input: fixture(
        ['U1','SW=sw GND=g',['sepic']],['L1','W1+=vi W1-=sw W2+=transfer W2-=g',[],'coupled-inductor'],['C1','1=sw 2=transfer'],['D1','A=transfer K=vo']),
      pairs: [['U1',1,'L1',2],['U1',1,'C1',1],['C1',2,'L1',3],['C1',2,'D1',1]] },
    { name: 'flyback primary source shunt and controller sense', id: 'flyback-primary', input: fixture(
        ['T1','PRI+=vi PRI-=sw',[],'transformer'],['Q1','G=gate S=sense D=sw'],['C1','1=vi 2=g'],
        ['R1','1=sense 2=g',[],'shunt'],['U1','CS=sense GND=g',['flyback-controller']]),
      pairs: [['T1',1,'C1',1],['T1',2,'Q1',3],['Q1',2,'R1',1],['R1',2,'C1',2],['U1',1,'R1',1]] },
    { name: 'flyback synchronous secondary', id: 'flyback-secondary', input: fixture(
        ['T1','SEC+=vo SEC-=sw',[],'transformer'],['Q1','G=gate S=g D=sw',['flyback-secondary-switch']],['C1','1=vo 2=g']),
      pairs: [['T1',2,'Q1',3],['Q1',2,'C1',2],['T1',1,'C1',1]] },
    { name: 'RF pi network', id: 'rf-matching', input: fixture(
        ['U1','RF=rf GND=g',['rf-matching']],['L1','1=rf 2=feed',['rf-series']],['C1','1=rf 2=g',['rf-shunt']],['C2','1=feed 2=g',['rf-shunt']]),
      pairs: [['U1',1,'L1',1],['L1',2,'C2',1],['U1',1,'C1',1]] },
    { name: 'RF T network', id: 'rf-matching', input: fixture(
        ['U1','RF=rf GND=g',['rf-matching']],['L1','1=rf 2=middle',['rf-series']],['C1','1=middle 2=g',['rf-shunt']],['L2','1=middle 2=feed',['rf-series']]),
      pairs: [['U1',1,'L1',1],['L1',2,'C1',1],['L1',2,'L2',1]] },
    { name: 'Ethernet PHY center-tap capacitor', id: 'ethernet-magnetics', input: fixture(
        ['U1','TX+=p TX-=m',['ethernet-phy']],['T1','PHY+=p PHY-=m LINE+=lp LINE-=lm PHYCT=ct',[],'ethernet-magnetics'],
        ['J1','1=lp 2=lm'],['C1','1=ct 2=g',['ethernet-center-tap-cap']]),
      pairs: [['U1',1,'T1',1],['U1',2,'T1',2],['T1',3,'J1',1],['T1',4,'J1',2],['T1',5,'C1',1]] },
    { name: 'Ethernet line-side center-tap termination', id: 'ethernet-magnetics', input: fixture(
        ['U1','TX+=p TX-=m',['ethernet-phy']],['T1','PHY+=p PHY-=m LINE+=lp LINE-=lm LINECT=ct',[],'ethernet-magnetics'],
        ['J1','1=lp 2=lm'],['R1','1=ct 2=chassisCap',['ethernet-line-termination']]),
      pairs: [['U1',1,'T1',1],['U1',2,'T1',2],['T1',3,'J1',1],['T1',4,'J1',2],['T1',5,'R1',1]] },
    { name: 'integrated Ethernet MagJack', id: 'ethernet-magnetics', input: fixture(
        ['U1','TX+=p TX-=m',['ethernet-phy']],['J1','PHY+=p PHY-=m',[],'magjack']),
      pairs: [['U1',1,'J1',1],['U1',2,'J1',2]] },
    { name: 'MagJack PHY center tap', id: 'ethernet-magnetics', input: fixture(
        ['U1','TX+=p TX-=m',['ethernet-phy']],['J1','PHY+=p PHY-=m PHYCT=ct',[],'magjack'],['C1','1=ct 2=g',['ethernet-center-tap-cap']]),
      pairs: [['U1',1,'J1',1],['U1',2,'J1',2],['J1',3,'C1',1]] },
    { name: 'common-mode choke receiver side', id: 'common-mode-choke', input: fixture(
        ['J1','1=p 2=m'],['L1','IN+=p OUT+=rp IN-=m OUT-=rm',[],'common-mode-choke'],['U1','RX+=rp RX-=rm',['common-mode-receiver']]),
      pairs: [['J1',1,'L1',1],['J1',2,'L1',3],['L1',2,'U1',1],['L1',4,'U1',2]] },
    { name: 'protection array serving repeated ports', id: 'repeated-port-protection', input: fixture(
        ['J1','1=p'],['J2','1=m'],['D1','IO1=p IO2=m GND=g',[],'esd']),
      pairs: [['J1',1,'D1',1],['J2',1,'D1',2]] },
    { name: 'repeated connector filters', id: 'repeated-port-protection', input: fixture(
        ['J1','1=p'],['J2','1=m'],['R1','1=p 2=rp',['connector-filter']],['R2','1=m 2=rm',['connector-filter']]),
      pairs: [['J1',1,'R1',1],['J2',1,'R2',1]] },
    { name: 'receiver-side AC coupling profile', id: 'ac-coupling-pair', input: fixture(
        ['U1','RX+=p RX-=m',['ac-coupling-receiver']],['C1','1=tp 2=p'],['C2','1=tm 2=m']),
      pairs: [['U1',1,'C1',2],['U1',2,'C2',2]] },
    { name: 'PLL external VCO filter', id: 'pll-filter', input: fixture(
        ['U1','CP=cp GND=g',['pll']],['U2','VTUNE=tune',['vco']],['R1','1=cp 2=tune'],['C1','1=tune 2=g']),
      pairs: [['U1',1,'R1',1],['R1',2,'U2',1],['U2',1,'C1',1]] },
    { name: 'PLL two-stage external VCO filter', id: 'pll-filter', input: fixture(
        ['U1','CP=cp GND=g',['pll']],['U2','VTUNE=tune',['vco']],['R1','1=cp 2=middle'],['R2','1=middle 2=tune'],['C1','1=middle 2=g'],['C2','1=tune 2=g']),
      pairs: [['U1',1,'R1',1],['R1',2,'R2',1],['R1',2,'C1',1],['R2',2,'U2',1],['U2',1,'C2',1]] },
    { name: 'Kelvin emitter return', id: 'driver-return', input: fixture(
        ['U1','OUT=drive COM=emitter',['gate-driver']],['R1','1=drive 2=gate'],['Q1','G=gate E=emitter C=sw KE=emitter',[],'igbt']),
      pairs: [['U1',2,'Q1',4]] },
    { name: 'MFB low-pass', id: 'active-filter', input: fixture(
        ['U1', 'OUT=out IN-=sum IN+=ref', ['active-filter']], ['R1', '1=in 2=mid'],
        ['R2', '1=mid 2=sum'], ['R3', '1=mid 2=out'], ['C1', '1=sum 2=out'], ['C2', '1=mid 2=ref']),
      pairs: [['R1',2,'R2',1],['R1',2,'R3',1],['R1',2,'C2',1],['R2',2,'U1',2],['R3',2,'U1',1],['C1',1,'U1',2],['C1',2,'U1',1]] },
    { name: 'capacitor feedback', id: 'opamp-feedback', input: fixture(
        ['U1', 'OUT=out IN-=sum IN+=in'], ['C1', '1=out 2=sum']),
      pairs: [['U1',1,'C1',1],['U1',2,'C1',2]] },
    { name: 'TIA parallel feedback capacitor', id: 'transimpedance', input: fixture(
        ['U1', 'OUT=out IN-=sum IN+=in'], ['R1', '1=out 2=sum'], ['C1', '1=out 2=sum'], ['D1', 'A=bias K=sum', [], 'photodiode']),
      pairs: [['U1',1,'R1',1],['U1',2,'R1',2],['U1',2,'D1',2],['U1',1,'C1',1],['U1',2,'C1',2]] },
    { name: 'TIA current source', id: 'transimpedance', input: fixture(
        ['U1', 'OUT=out IN-=sum IN+=in'], ['R1', '1=out 2=sum'], ['I1', 'OUT=sum RETURN=return', [], 'current-source']),
      pairs: [['U1',1,'R1',1],['U1',2,'R1',2],['U1',2,'I1',1]] },
    { name: 'RC snubber capacitor first', id: 'snubber', input: fixture(
        ['Q1', 'G=gate S=g D=sw'], ['C1', '1=sw 2=rc'], ['R1', '1=rc 2=g']),
      pairs: [['Q1',3,'C1',1],['C1',2,'R1',1],['R1',2,'Q1',2]] },
    { name: 'RCD clamp across switch', id: 'snubber', input: fixture(
        ['Q1', 'G=gate S=g D=sw'], ['D1', 'A=sw K=clamp'], ['C1', '1=clamp 2=g'], ['R1', '1=clamp 2=g']),
      pairs: [['Q1',3,'D1',1],['D1',2,'C1',1],['D1',2,'R1',1],['C1',2,'Q1',2],['R1',2,'Q1',2]] },
    { name: 'flyback RCD clamp returns to input rail', id: 'snubber', input: fixture(
        ['Q1', 'G=gate S=g D=sw'], ['T1', 'PRI+=vi PRI-=sw', [], 'transformer'],
        ['D1', 'A=sw K=clamp'], ['C1', '1=clamp 2=vi'], ['R1', '1=clamp 2=vi']),
      pairs: [['Q1',3,'D1',1],['D1',2,'C1',1],['D1',2,'R1',1],['C1',2,'T1',1],['R1',2,'T1',1]] },
    { name: 'TVS switch clamp', id: 'snubber', input: fixture(
        ['Q1', 'G=gate S=g D=sw'], ['D1', '1=sw 2=g', [], 'tvs']),
      pairs: [['Q1',3,'D1',1],['Q1',2,'D1',2]] },
    { name: 'four-terminal Kelvin shunt', id: 'shunt-kelvin', input: fixture(
        ['U1', 'IN+=high IN-=low', ['current-sense']], ['R1', 'FORCE+=high FORCE-=low SENSE+=high SENSE-=low', [], 'shunt']),
      pairs: [['U1',1,'R1',3],['U1',2,'R1',4]] },
    { name: 'Kelvin source return', id: 'driver-return', input: fixture(
        ['U1', 'OUT=drive COM=source', ['gate-driver']], ['R1', '1=drive 2=gate'], ['Q1', 'G=gate S=source D=sw KS=source']),
      pairs: [['U1',2,'Q1',4]] },
    { name: 'IGBT emitter return', id: 'driver-return', input: fixture(
        ['U1', 'OUT=drive COM=emitter', ['gate-driver']], ['R1', '1=drive 2=gate'], ['Q1', 'G=gate E=emitter C=sw', [], 'igbt']),
      pairs: [['U1',2,'Q1',2]] },
    { name: 'reverse gate diode', id: 'gate-split-resistors', input: fixture(
        ['U1', 'OUT=drive', ['gate-driver']], ['R1', '1=drive 2=gate'], ['D1', 'A=mid K=drive'], ['R2', '1=mid 2=gate'], ['Q1', 'G=gate S=g D=sw']),
      pairs: [['U1',1,'R1',1],['R1',2,'Q1',1],['U1',1,'D1',2],['D1',1,'R2',1],['R2',2,'Q1',1]] },
    { name: 'separate gate on/off outputs', id: 'gate-split-resistors', input: fixture(
        ['U1', 'OUTH=on OUTL=off', ['gate-driver']], ['R1', '1=on 2=gate'], ['R2', '1=off 2=gate'], ['Q1', 'G=gate S=g D=sw']),
      pairs: [['U1',1,'R1',1],['R1',2,'Q1',1],['U1',2,'R2',1],['R2',2,'Q1',1]] },
    { name: 'filtered analog supply', id: 'filtered-supply', input: fixture(
        ['U1', 'VDDA=filtered AGND=g'], ['C1', '1=filtered 2=g'], ['L1', '1=raw 2=filtered', ['supply-filter']]),
      pairs: [['U1',1,'C1',1]] },
    { name: 'power and bias share a rail but require distinct pins', id: 'controller-bias', input: fixture(
        ['U1', 'PVIN=v AVIN=v GND=g'], ['C1', '1=v 2=g'], ['C2', '1=v 2=g']),
      pairs: [['U1',1,'C1',1],['U1',2,'C2',1]] },
    { name: 'COMP shunt capacitor', id: 'compensation', input: fixture(
        ['U1', 'COMP=comp GND=g'], ['C1', '1=comp 2=g']),
      pairs: [['U1',1,'C1',1],['C1',2,'U1',2]] },
    { name: 'COMP parallel RC', id: 'compensation', input: fixture(
        ['U1', 'COMP=comp GND=g'], ['C1', '1=comp 2=g'], ['R1', '1=comp 2=g']),
      pairs: [['U1',1,'C1',1],['C1',2,'U1',2],['U1',1,'R1',1],['R1',2,'U1',2]] },
    { name: 'ADC common-mode caps', id: 'differential-adc-filter', input: fixture(
        ['U1', 'IN+=p IN-=m GND=g', ['adc']], ['R1', '1=ip 2=p'], ['R2', '1=im 2=m'], ['C1', '1=p 2=g'], ['C2', '1=m 2=g']),
      pairs: [['U1',1,'R1',2],['U1',2,'R2',2],['U1',1,'C1',1],['U1',2,'C2',1],['U1',3,'C1',2],['U1',3,'C2',2]] },
    { name: 'differential receiver termination', id: 'receiver-termination', input: fixture(
        ['U1', 'RX+=p RX-=m', ['receiver-termination']], ['R1', '1=p 2=m']),
      pairs: [['U1',1,'R1',1],['U1',2,'R1',2]] },
    { name: 'reference buffer with feedback resistor', id: 'reference-buffer', input: fixture(
        ['U1', 'OUT=ref IN-=sum IN+=source', ['reference-buffer']], ['R1', '1=ref 2=sum'],
        ['U2', 'REF=ref GND=g', ['adc']], ['C1', '1=ref 2=g']),
      pairs: [['U1',1,'U2',1],['U2',1,'C1',1],['U1',1,'R1',1],['U1',2,'R1',2]] },
    { name: 'balun single-ended endpoint', id: 'rf-balun', input: fixture(
        ['U1', 'RF+=p RF-=m', ['rf']], ['T1', 'IN+=p IN-=m OUT=antenna', [], 'balun'], ['J1', 'RF=antenna', ['rf-endpoint']]),
      pairs: [['U1',1,'T1',1],['U1',2,'T1',2],['T1',3,'J1',1]] },
    { name: 'inductive-load TVS', id: 'inductive-clamp', input: fixture(
        ['M1', '1=high 2=low', [], 'inductive-load'], ['D1', '1=high 2=low', [], 'tvs']),
      pairs: [['M1',1,'D1',1],['M1',2,'D1',2]] },
];
const pairDsl = ([a, ap, b, bp]: PadPair) => `criticalPair(pin(${JSON.stringify(a)},${ap}),pin(${JSON.stringify(b)},${bp}));`;
for (const { name, id, input, pairs } of expanded) {
    test(name + ': topology, wrong/missing intent and corrected pad intent', () => {
        const original = structuredClone(input);
        const matches = detectCircuitPatterns(input).filter(m => m.patternId === id);
        assert.ok(matches.length, 'topology not recognized');
        const validationInput = boardWide(input);
        const code = 'block("fixture",' + JSON.stringify(validationInput.circuit.components.map(c => c.designator)) + ',"generic",{allowDisconnected:true});';
        const check = (suffix: string) => {
            const diagnostics = validatePcbLayoutIntent({ ...validationInput, code: code + suffix });
            assert.deepEqual(diagnostics.filter(d => d.severity === 'error'), [], JSON.stringify(diagnostics));
            return diagnostics.filter(d => d.code === 'PCB_INTENT_' + id.replace(/-/g, '_').toUpperCase());
        };
        assert.ok(check('').length, 'missing relations must be diagnosed');
        assert.deepEqual(check(pairs.map(pairDsl).join('')), [], 'authored pad relations must satisfy the motif');
        assert.ok(check(pairs.slice(1).map(pairDsl).join('')).length, 'omitting an actual branch must not pass');
        const reversed = structuredClone(input);
        reversed.circuit.components.reverse().forEach(c => c.pins.reverse());
        assert.deepEqual(detectCircuitPatterns(reversed), detectCircuitPatterns(input));
        const disconnected = structuredClone(input);
        for (const c of disconnected.circuit.components) for (const p of c.pins) p.signal_name = c.designator + '.' + p.pin_number;
        assert.equal(detectCircuitPatterns(disconnected).some(m => m.patternId === id), false);
        assert.deepEqual(input, original);
    });
}

test('Kelvin terminals cannot be substituted by force terminals sharing the same nets', () => {
    const input = expanded.find(c => c.name === 'four-terminal Kelvin shunt')!.input;
    const code = 'block("sense",["U1","R1"]);' + pairDsl(['U1',1,'R1',1]) + pairDsl(['U1',2,'R1',2]);
    assert.ok(validatePcbLayoutIntent({ ...input, code }).some(d => d.code === 'PCB_INTENT_SHUNT_KELVIN'));
    const ambiguous = structuredClone(input);
    ambiguous.circuit.components[1].pins.forEach(p => p.name = String(p.pin_number));
    assert.equal(detectCircuitPatterns(ambiguous).some(m => m.patternId === 'shunt-kelvin'), false);
    const driver = expanded.find(c => c.name === 'Kelvin source return')!.input;
    const forceReturn = 'block("drive",["U1","R1","Q1"]);' + pairDsl(['U1',2,'Q1',2]);
    assert.ok(validatePcbLayoutIntent({ ...driver, code: forceReturn }).some(d => d.code === 'PCB_INTENT_DRIVER_RETURN'));
});

test('QSPI clock alone does not satisfy connected data and chip-select obligations', () => {
    const input = fixture(['U1', 'SCK=clk IO0=d0 IO1=d1 IO2=d2 IO3=d3 CS=cs', ['qspi-host']],
        ['U2', 'SCK=clk IO0=d0 IO1=d1 IO2=d2 IO3=d3 CS=cs', ['qspi-flash']]);
    assert.equal(detectCircuitPatterns(input).find(m => m.patternId === 'qspi-flash')!.requirements.length, 6);
    const base = 'block("memory",["U1","U2"]);';
    assert.ok(validatePcbLayoutIntent({ ...input, code: base + pairDsl(['U1',1,'U2',1]) }).some(d => d.code === 'PCB_INTENT_QSPI_FLASH'));
    const pairs = Array.from({ length: 6 }, (_, i) => pairDsl(['U1',i+1,'U2',i+1])).join('');
    assert.equal(validatePcbLayoutIntent({ ...input, code: base + pairs }).some(d => d.code === 'PCB_INTENT_QSPI_FLASH'), false);
});

test('bulk capacitor cannot determine the rigid group of a local capacitor even with a correct bypass', () => {
    const input = fixture(['U1', 'VDD=v GND=g'], ['C1', '1=v 2=g', ['bulk-capacitor']], ['C2', '1=v 2=g', ['local-capacitor']]);
    const mixed = 'block("power",["U1","C1","C2"],"generic",{localLayout:{C1:{x:0,y:0},C2:{x:2,y:0}}}); bypass(["C2"],pin("U1",1));';
    assert.ok(validatePcbLayoutIntent({ ...input, code: mixed }).some(d => d.code === 'PCB_INTENT_BULK_LOCAL_CAPS'));
    const separate = 'block("power",["U1","C1","C2"]); bypass(["C2"],pin("U1",1));';
    assert.equal(validatePcbLayoutIntent({ ...input, code: separate }).some(d => d.code === 'PCB_INTENT_BULK_LOCAL_CAPS'), false);
});

test('distinct named supply domains on the same rail need their own pin targets', () => {
    const input = fixture(['U1','VDDA=v VDDIO=v GND=g'],['C1','1=v 2=g'],['C2','1=v 2=g']);
    const base = 'block("supply",["U1","C1","C2"]);';
    assert.ok(validatePcbLayoutIntent({ ...input, code: base + 'capCluster(["C1","C2"],{powerNet:"v",returnNet:"g",target:pin("U1",1)});' }).some(d => d.code === 'PCB_INTENT_SUPPLY_DOMAINS'));
    assert.equal(validatePcbLayoutIntent({ ...input, code: base + pairDsl(['C1',1,'U1',1]) + pairDsl(['C2',1,'U1',2]) }).some(d => d.code === 'PCB_INTENT_SUPPLY_DOMAINS'), false);
});

test('supply pins far apart on the same package side cannot collapse into a single inferred group',()=>{
    const input=fixture(['U1','VDD=v VDD=v GND=g'],['C1','1=v 2=g'],['C2','1=v 2=g']);
    const footprints={U1:{name:'long',width:8,height:20,pads:[
        {pin_number:1,x:-4,y:-8,width:1,height:1},{pin_number:2,x:-4,y:8,width:1,height:1},{pin_number:3,x:4,y:0,width:1,height:1}]}};
    const base='block("supply",["U1","C1","C2"]);';
    assert.ok(validatePcbLayoutIntent({...input,footprints,code:base+'bypass(["C1","C2"],pin("U1",1));'}).some(d=>d.code==='PCB_INTENT_DISTRIBUTED_SUPPLY'));
    assert.equal(validatePcbLayoutIntent({...input,footprints,code:base+'bypass(["C1"],pin("U1",1));bypass(["C2"],pin("U1",2));'}).some(d=>d.code==='PCB_INTENT_DISTRIBUTED_SUPPLY'),false);
    footprints.U1.pads.push({...footprints.U1.pads[0],x:4});
    assert.ok(validatePcbLayoutIntent({...input,footprints,code:base}).some(d=>d.code==='PCB_INTENT_DISTRIBUTED_SUPPLY'));
});

test('full gate/source/drain aliases establish a MOSFET without guessing its part identity',()=>{
    const input=fixture(['U1','OUT=drive COM=source',['gate-driver']],['R1','1=drive 2=gate'],['Q1','GATE=gate SOURCE=source DRAIN=sw']);
    assert.ok(detectCircuitPatterns(input).some(m=>m.patternId==='gate-resistor'));
    assert.ok(detectCircuitPatterns(input).some(m=>m.patternId==='driver-return'));
});

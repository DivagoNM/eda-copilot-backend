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
        const code = 'block("fixture",' + JSON.stringify(input.circuit.components.map(c => c.designator)) + ',"generic",{allowDisconnected:true});';
        const check = (suffix: string) => {
            const diagnostics = validatePcbLayoutIntent({ ...input, code: code + suffix });
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

test('verified amplifier channels remain coherent on one IC and validate both feedback branches', () => {
    const input = fixture(['U1', 'OUT=oa IN-=ma IN+=pa OUT=ob IN-=mb IN+=pb'], ['R1', '1=oa 2=ma'], ['R2', '1=ob 2=mb']);
    assert.equal(detectCircuitPatterns(input).some(m => m.patternId === 'opamp-feedback'), false);
    input.knowledge!.components!.U1 = { channels: { A: { OUT: 1, 'IN-': 2, 'IN+': 3 }, B: { OUT: 4, 'IN-': 5, 'IN+': 6 } } };
    const matches = detectCircuitPatterns(input).filter(m => m.patternId === 'opamp-feedback');
    assert.equal(matches.length, 2);
    assert.deepEqual(matches.map(m => [m.pins['amp.out'].pin_number, m.pins['amp.minus'].pin_number]).sort(), [[1,2],[4,5]]);
    const base = 'block("amp",["U1","R1","R2"]);';
    const a = pairDsl(['U1',1,'R1',1]) + pairDsl(['U1',2,'R1',2]);
    const b = pairDsl(['U1',4,'R2',1]) + pairDsl(['U1',5,'R2',2]);
    assert.ok(validatePcbLayoutIntent({ ...input, code: base + a }).some(d => d.code === 'PCB_INTENT_OPAMP_FEEDBACK' && d.context?.components?.includes('R2')));
    assert.equal(validatePcbLayoutIntent({ ...input, code: base + a + b }).some(d => d.code === 'PCB_INTENT_OPAMP_FEEDBACK'), false);
    input.knowledge!.components!.U1.channels!.B.OUT = 99;
    assert.ok(validatePcbLayoutIntent({ ...input, code: base }).some(d => d.code === 'PCB_KNOWLEDGE_REF'));
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

test('declared memory speed needs require the requested priority; invalid endpoint maps are errors', () => {
    const input = fixture(['U1', 'GPIO1=clk GPIO2=data'], ['U2', 'SCK=clk IO0=data']);
    input.knowledge!.components!.U1 = { interfaces: [{ function: 'qspi', peer: 'U2',
        signals: [{source:1,target:1},{source:2,target:2}], minimumPriority: 'critical' }] };
    const base = 'block("memory",["U1","U2"]);';
    const high = [1,2].map(p => `criticalPair(pin("U1",${p}),pin("U2",${p}),{priority:"high",hard:true});`).join('');
    assert.ok(validatePcbLayoutIntent({ ...input, code: base + high }).some(d => d.code === 'PCB_INTENT_QSPI_FLASH'));
    assert.equal(validatePcbLayoutIntent({ ...input, code: base + [1,2].map(p => pairDsl(['U1',p,'U2',p])).join('') }).some(d => d.code === 'PCB_INTENT_QSPI_FLASH'), false);
    input.knowledge!.components!.U1.interfaces![0].signals[0].target = 2;
    assert.ok(validatePcbLayoutIntent({ ...input, code: base }).some(d => d.code === 'PCB_KNOWLEDGE_INTERFACE'));
});

test('antenna rotation and keepout intent require the declared restriction, dimensions, layers and exceptions', () => {
    const input = fixture(['U1', 'RF=antenna']);
    input.knowledge!.components!.U1 = { placement: { purpose: 'antenna', edge: 'right', rotations: [0],
        keepout: { region: 'radiator', minimumWidth: 8, minimumHeight: 5, layers: ['top','bottom'], allowBlocks: ['antenna'] } } };
    const base = 'block("antenna",["U1"]); edge(comp("U1"),"right");';
    const region = (width: number, layers: string[], allow = ['antenna']) => `constraintRegion("radiator",{shape:region.rect({anchor:anchor("board.right"),width:${width},height:5}),layers:${JSON.stringify(layers)},allow:{blocks:${JSON.stringify(allow)}}});`;
    const check = (suffix: string) => validatePcbLayoutIntent({ ...input, code: base + suffix });
    assert.ok(check('').some(d => d.code === 'PCB_INTENT_ANTENNA_REGION'));
    const rotation = 'component("U1").rotations(0);';
    assert.ok(check(rotation + region(7,['top','bottom'])).some(d => d.code === 'PCB_INTENT_ANTENNA_REGION'));
    assert.ok(check(rotation + region(8,['top'])).some(d => d.code === 'PCB_INTENT_ANTENNA_REGION'));
    assert.ok(check('component("U1").rotations(0,90);' + region(8,['top','bottom'])).some(d => d.code === 'PCB_INTENT_ANTENNA_REGION'));
    const satisfied = check(rotation + region(8,['top','bottom']));
    assert.deepEqual(satisfied.filter(d => d.severity !== 'info'), []);
});

test('isolation clearance does not excuse a rigid localLayout crossing declared domains', () => {
    const input = fixture(['U1', 'VDD=v1 GND=g1'], ['U2', 'VDD=v2 GND=g2']);
    input.knowledge!.isolation = { domains: { U1: 'primary', U2: 'secondary' }, minClearance: 5 };
    const clearance = 'clearance(comp("U1"),comp("U2"),5);';
    const mixed = 'block("isolated",["U1","U2"],"generic",{allowDisconnected:true,localLayout:{U1:{x:0,y:0},U2:{x:10,y:0}}});';
    assert.ok(validatePcbLayoutIntent({ ...input, code: mixed + clearance }).some(d => d.code === 'PCB_INTENT_ISOLATION_DOMAINS'));
    const separate = 'block("primary",["U1"]); block("secondary",["U2"]);';
    assert.equal(validatePcbLayoutIntent({ ...input, code: separate + clearance }).some(d => d.code === 'PCB_INTENT_ISOLATION_DOMAINS'), false);
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

test('multiple charge-pump channels retain both distinct flying-capacitor pairs', () => {
    const input = fixture(['U1','C+=p1 C-=m1 C+=p2 C-=m2'],['C1','1=p1 2=m1'],['C2','1=p2 2=m2']);
    input.knowledge!.components!.U1 = { channels: { A: {'C+':1,'C-':2}, B:{'C+':3,'C-':4} } };
    assert.equal(detectCircuitPatterns(input).filter(m => m.patternId === 'charge-pump').length, 2);
    const base = 'block("pump",["U1","C1","C2"]);';
    const one = pairDsl(['U1',1,'C1',1]) + pairDsl(['U1',2,'C1',2]);
    assert.ok(validatePcbLayoutIntent({ ...input, code: base + one }).some(d => d.code === 'PCB_INTENT_CHARGE_PUMP' && d.context?.components?.includes('C2')));
    assert.equal(validatePcbLayoutIntent({ ...input, code: base + one + pairDsl(['U1',3,'C2',1]) + pairDsl(['U1',4,'C2',2]) }).some(d => d.code === 'PCB_INTENT_CHARGE_PUMP'), false);
});

test('ESD arrays use verified channels and Ethernet protection is excluded from ordinary entry placement', () => {
    const input = fixture(['J1','1=p 2=m'],['D1','IO=p IO=m GND=g',[],'esd']);
    input.knowledge!.components!.D1.channels = { A: {IO:1,GND:3}, B:{IO:2,GND:3} };
    assert.equal(detectCircuitPatterns(input).filter(m => m.patternId === 'esd-entry').length, 2);
    const base = 'block("port",["J1","D1"]);';
    assert.ok(validatePcbLayoutIntent({ ...input, code: base + pairDsl(['J1',1,'D1',1]) }).some(d => d.code === 'PCB_INTENT_ESD_ENTRY'));
    assert.equal(validatePcbLayoutIntent({ ...input, code: base + pairDsl(['J1',1,'D1',1]) + pairDsl(['J1',2,'D1',2]) }).some(d => d.code === 'PCB_INTENT_ESD_ENTRY'), false);
    input.knowledge!.components!.D1.functions = ['ethernet-protection'];
    assert.equal(detectCircuitPatterns(input).some(m => m.patternId === 'esd-entry'), false);
});

test('confirmed choke chain preserves the declared receiver-side protection rather than connector-side locality', () => {
    const input = fixture(['J1','1=p 2=m'],['L1','IN+=p OUT+=rp IN-=m OUT-=rm',[],'common-mode-choke'],
        ['U1','RX+=rp RX-=rm'],['D1','IO1=rp IO2=rm GND=g',[],'esd']);
    input.knowledge!.components!.L1.entryChain = { connector:'J1', receiver:'U1', protection:{component:'D1',side:'receiver'} };
    const code = 'block("entry",["J1","L1","U1","D1"]);';
    const core = pairDsl(['J1',1,'L1',1]) + pairDsl(['J1',2,'L1',3]) + pairDsl(['L1',2,'U1',1]) + pairDsl(['L1',4,'U1',2]);
    const wrong = pairDsl(['J1',1,'D1',1]) + pairDsl(['J1',2,'D1',2]);
    assert.ok(validatePcbLayoutIntent({ ...input, code:code+core+wrong }).some(d => d.code === 'PCB_INTENT_COMMON_MODE_CHOKE'));
    const correct = pairDsl(['L1',2,'D1',1]) + pairDsl(['L1',4,'D1',2]);
    assert.equal(validatePcbLayoutIntent({ ...input, code:code+core+correct }).some(d => d.code === 'PCB_INTENT_COMMON_MODE_CHOKE'), false);
    const reversed = structuredClone(input);
    reversed.circuit.components.reverse().forEach(c => c.pins.reverse());
    assert.deepEqual(detectCircuitPatterns(reversed),detectCircuitPatterns(input));
    input.knowledge!.components!.L1.entryChain!.protection!.side = 'connector';
    assert.ok(validatePcbLayoutIntent({ ...input, code }).some(d => d.code === 'PCB_KNOWLEDGE_CHAIN'));
});

test('opto support respects per-pin domains without treating the isolator as one domain', () => {
    const input = fixture(['U1','A=led K=secondary C=collector E=primary',[],'optocoupler'],
        ['R1','1=v2 2=led'],['R2','1=v1 2=collector']);
    input.knowledge!.isolation = { domains:{R1:'secondary',R2:'primary'}, minClearance:5,
        pinDomains:{U1:{'1':'secondary','2':'secondary','3':'primary','4':'primary'}} };
    const code = 'block("opto",["U1","R1","R2"],"generic",{allowDisconnected:true});' +
        pairDsl(['U1',1,'R1',2]) + pairDsl(['U1',3,'R2',2]) + 'clearance(comp("R1"),comp("R2"),5);';
    assert.deepEqual(validatePcbLayoutIntent({ ...input, code }).filter(d=>d.severity!=='info'),[]);
    input.knowledge!.isolation.domains.R1 = 'primary';
    const diagnostics = validatePcbLayoutIntent({ ...input, code });
    assert.ok(diagnostics.some(d=>d.code==='PCB_ISOLATION_NET' && d.message.includes('led')));
    input.knowledge!.isolation.pinDomains!.U1['99']='primary';
    assert.ok(validatePcbLayoutIntent({ ...input, code }).some(d=>d.code==='PCB_KNOWLEDGE_REF'));
});

test('preferred gate-resistor side selects the confirmed branch instead of requiring both endpoints to be local', () => {
    const input = structuredClone(cases['gate-resistor']);
    input.knowledge!.components!.U1.preferredGateResistorSide = 'device';
    const base = 'block("gate",["U1","R1","Q1"]);';
    const driver = pairDsl(['U1',1,'R1',1]), device = pairDsl(['R1',2,'Q1',1]);
    assert.ok(validatePcbLayoutIntent({ ...input, code:base+driver }).some(d=>d.code==='PCB_INTENT_GATE_RESISTOR'));
    assert.equal(validatePcbLayoutIntent({ ...input, code:base+device }).some(d=>d.code==='PCB_INTENT_GATE_RESISTOR'),false);
    input.knowledge!.components!.U1.preferredGateResistorSide = 'driver';
    assert.equal(validatePcbLayoutIntent({ ...input, code:base+driver }).some(d=>d.code==='PCB_INTENT_GATE_RESISTOR'),false);
});

test('declared quiet-controller and external-load locations add application intent to their existing catalog entries', () => {
    const quiet=fixture(['U1','OUT=gate'],['Q1','G=gate S=g D=sw']);
    quiet.knowledge!.components!.U1={functions:['flyback-controller'],placement:{purpose:'quiet-controller',avoid:['Q1'],minDistance:3}};
    const code='block("power",["U1","Q1"]);';
    assert.ok(validatePcbLayoutIntent({...quiet,code}).some(d=>d.code==='PCB_INTENT_FLYBACK_PRIMARY'));
    assert.equal(validatePcbLayoutIntent({...quiet,code:code+'clearance(comp("U1"),comp("Q1"),3);'}).some(d=>d.code==='PCB_INTENT_FLYBACK_PRIMARY'),false);
    const load=fixture(['D1','A=low K=high',[],'flyback-diode'],['J1','1=high 2=low']);
    load.knowledge!.components!.D1.placement={purpose:'external-load',target:'J1'};
    const base='block("load",["D1","J1"]);';
    assert.ok(validatePcbLayoutIntent({...load,code:base}).some(d=>d.code==='PCB_INTENT_INDUCTIVE_CLAMP'));
    assert.equal(validatePcbLayoutIntent({...load,code:base+'near(comp("D1"),comp("J1"),"high");'}).some(d=>d.code==='PCB_INTENT_INDUCTIVE_CLAMP'),false);
});

for (const [id,owner,expected] of [
    ['parallel-gates','U1',[['R1',2,'Q1',1],['R2',2,'Q2',1]]],
    ['differential-amplifier','U1',[['R2',2,'U1',2],['R3',2,'U1',3]]],
    ['ac-coupling-pair','U1',[['U1',1,'C1',1],['U1',2,'C2',1]]],
] as Array<[string,string,PadPair[]]>) {
    test(id+': declared symmetry is measured only from complete authored poses and supplied pad geometry',()=>{
        const input=structuredClone(cases[id]);
        input.knowledge!.components![owner] ??= {};
        input.knowledge!.components![owner].branchLengthTolerance=0.25;
        if(id==='differential-amplifier'){
            input.knowledge!.components!.R3={functions:['differential-input']};
            input.knowledge!.components!.R4={functions:['differential-return']};
        }
        const match=detectCircuitPatterns(input).find(m=>m.patternId===id)!;
        const balance=match.requirements.find(r=>r.relation==='balanced');
        assert.ok(balance?.relation==='balanced');
        const branches=expected.map(([a,ap,b,bp])=>({source:{designator:a,pin_number:ap},target:{designator:b,pin_number:bp}}));
        assert.deepEqual(balance.branches,branches);
        const names=input.circuit.components.map(c=>c.designator);
        const base='block("balanced",'+JSON.stringify(names)+',"generic",{allowDisconnected:true});';
        assert.ok(validatePcbLayoutIntent({...input,code:base}).some(d=>d.code==='PCB_INTENT_'+id.replace(/-/g,'_').toUpperCase()+'_COVERAGE'));
        const coordinates:Record<string,{x:number;y:number;rotate:number}>=Object.fromEntries(names.map((n,i)=>[n,{x:-10,y:-10-i*4,rotate:0}]));
        branches.forEach((b,i)=>{
            coordinates[b.source.designator]={x:0,y:i*4,rotate:0};
            coordinates[b.target.designator]={x:2,y:i*4,rotate:0};
        });
        // When both branches end at one IC, its distinct physical pads carry
        // the branch offset rather than separate component positions.
        const footprints=Object.fromEntries(input.circuit.components.map(c=>[c.designator,{name:'authored',width:2,height:2,
            pads:c.pins.map(p=>({pin_number:p.pin_number,x:0,y:0,width:0.2,height:0.2}))}]));
        if(branches[0].target.designator===branches[1].target.designator){
            const common=branches[0].target.designator;
            coordinates[common]={x:2,y:0,rotate:0};
            footprints[common].pads.find(p=>String(p.pin_number)===String(branches[1].target.pin_number))!.y=4;
        }
        if(branches[0].source.designator===branches[1].source.designator){
            const common=branches[0].source.designator;
            coordinates[common]={x:0,y:0,rotate:0};
            footprints[common].pads.find(p=>String(p.pin_number)===String(branches[1].source.pin_number))!.y=4;
        }
        const code=(poses:typeof coordinates)=>'block("balanced",'+JSON.stringify(names)+',"generic",{allowDisconnected:true,localLayout:'+JSON.stringify(poses)+'});'+
            names.map(n=>'component('+JSON.stringify(n)+').top();').join('')+
            match.requirements.filter(r=>r.relation==='local').map(r=>r.relation==='local'?pairDsl([r.source.designator,Number(r.source.pin_number),r.target.designator,Number(r.target.pin_number)]):'').join('');
        const satisfied=validatePcbLayoutIntent({...input,footprints,code:code(coordinates)});
        assert.deepEqual(satisfied.filter(d=>d.severity!=='info'),[],JSON.stringify(satisfied));
        assert.equal(satisfied.some(d=>d.code.endsWith('_COVERAGE') && d.message.includes('authored pad spans')),false);
        const bad=structuredClone(coordinates);
        const move=branches[1].target.designator===branches[0].target.designator ? branches[1].source.designator : branches[1].target.designator;
        bad[move].x+=2;
        assert.ok(validatePcbLayoutIntent({...input,footprints,code:code(bad)}).some(d=>d.code==='PCB_INTENT_'+id.replace(/-/g,'_').toUpperCase()));
        const translated=Object.fromEntries(Object.entries(coordinates).map(([n,p])=>[n,{...p,x:p.x+1_000_000,y:p.y-1_000_000}]));
        assert.equal(validatePcbLayoutIntent({...input,footprints,code:code(translated)}).some(d=>d.code==='PCB_INTENT_'+id.replace(/-/g,'_').toUpperCase()),false);
        const repeated=structuredClone(footprints);
        const pin=branches[0].source;
        repeated[pin.designator].pads.push({...repeated[pin.designator].pads.find(p=>String(p.pin_number)===String(pin.pin_number))!});
        assert.ok(validatePcbLayoutIntent({...input,footprints:repeated,code:code(coordinates)}).some(d=>d.code.endsWith('_COVERAGE') && d.message.includes('authored pad spans')));
        assert.ok(validatePcbLayoutIntent({...input,code:code(coordinates)}).some(d=>d.code.endsWith('_COVERAGE') && d.message.includes('authored pad spans')));
        const flexibleLayer=code(coordinates).replace('component('+JSON.stringify(pin.designator)+').top();','');
        assert.ok(validatePcbLayoutIntent({...input,footprints,code:flexibleLayer}).some(d=>d.code.endsWith('_COVERAGE') && d.message.includes('authored pad spans')));
    });
}

test('magnetic alignment uses the declared mechanical offset and tolerance; unknown poses are unverified',()=>{
    const input=fixture(['U1','OUT=sensor'],['M1','1=mechanics']);
    input.knowledge!.components!.U1={placement:{purpose:'magnetic-sensor',target:'M1',alignment:{axis:'both',tolerance:0.01,offset:{x:1,y:0}}}};
    const base='block("mechanics",["U1","M1"],"generic",{allowDisconnected:true}); near(comp("U1"),comp("M1"),"high");';
    assert.ok(validatePcbLayoutIntent({...input,code:base}).some(d=>d.code==='PCB_INTENT_MAGNETIC_SENSOR_COVERAGE'));
    const placed=(x:number)=>'block("mechanics",["U1","M1"],"generic",{allowDisconnected:true,localLayout:{U1:{x:'+x+',y:0},M1:{x:0,y:0}}});';
    assert.ok(validatePcbLayoutIntent({...input,code:placed(2)}).some(d=>d.code==='PCB_INTENT_MAGNETIC_SENSOR'));
    assert.equal(validatePcbLayoutIntent({...input,code:placed(1)}).some(d=>d.code==='PCB_INTENT_MAGNETIC_SENSOR'||d.code==='PCB_INTENT_MAGNETIC_SENSOR_COVERAGE'),false);
});

test('supply pins far apart on the same package side cannot collapse into a single inferred group',()=>{
    const input=fixture(['U1','VDD=v VDD=v GND=g'],['C1','1=v 2=g'],['C2','1=v 2=g']);
    const footprints={U1:{name:'long',width:8,height:20,pads:[
        {pin_number:1,x:-4,y:-8,width:1,height:1},{pin_number:2,x:-4,y:8,width:1,height:1},{pin_number:3,x:4,y:0,width:1,height:1}]}};
    const base='block("supply",["U1","C1","C2"]);';
    assert.ok(validatePcbLayoutIntent({...input,footprints,code:base+'bypass(["C1","C2"],pin("U1",1));'}).some(d=>d.code==='PCB_INTENT_DISTRIBUTED_SUPPLY'));
    assert.equal(validatePcbLayoutIntent({...input,footprints,code:base+'bypass(["C1"],pin("U1",1));bypass(["C2"],pin("U1",2));'}).some(d=>d.code==='PCB_INTENT_DISTRIBUTED_SUPPLY'),false);
    footprints.U1.pads.push({...footprints.U1.pads[0],x:4});
    assert.ok(validatePcbLayoutIntent({...input,footprints,code:base}).some(d=>d.code==='PCB_INTENT_COVERAGE'&&d.message.includes('duplicate pads')));
});

test('memory interfaces recognize a series clock resistor and retain both of its placement obligations',()=>{
    const input=fixture(['U1','SCK=source IO0=data',['qspi-host']],['R1','1=source 2=clock'],['U2','SCK=clock IO0=data',['qspi-flash']]);
    const matches=detectCircuitPatterns(input).filter(m=>m.patternId==='qspi-flash');
    assert.equal(matches.length,1);
    assert.deepEqual(matches[0].components,['R1','U1','U2']);
    assert.deepEqual(matches[0].nets,['clock','data','source']);
    assert.equal(matches[0].requirements.length,3);
    const base='block("memory",["U1","R1","U2"]);';
    const direct=pairDsl(['U1',1,'U2',1])+pairDsl(['U1',2,'U2',2]);
    assert.ok(validatePcbLayoutIntent({...input,code:base+direct}).some(d=>d.code==='PCB_INTENT_QSPI_FLASH'));
    const correct=pairDsl(['U1',1,'R1',1])+pairDsl(['R1',2,'U2',1])+pairDsl(['U1',2,'U2',2]);
    assert.equal(validatePcbLayoutIntent({...input,code:base+correct}).some(d=>d.code==='PCB_INTENT_QSPI_FLASH'),false);
    input.knowledge!.components!.U1.interfaces=[{function:'qspi',peer:'U2',signals:[{source:1,target:1},{source:2,target:2}]}];
    assert.equal(validatePcbLayoutIntent({...input,code:base+correct}).some(d=>d.severity==='error'||d.code==='PCB_INTENT_QSPI_FLASH'),false);
    const reversed=structuredClone(input);
    reversed.circuit.components.reverse().forEach(c=>c.pins.reverse());
    assert.deepEqual(detectCircuitPatterns(reversed),detectCircuitPatterns(input));
});

test('full gate/source/drain aliases establish a MOSFET without guessing its part identity',()=>{
    const input=fixture(['U1','OUT=drive COM=source',['gate-driver']],['R1','1=drive 2=gate'],['Q1','GATE=gate SOURCE=source DRAIN=sw']);
    assert.ok(detectCircuitPatterns(input).some(m=>m.patternId==='gate-resistor'));
    assert.ok(detectCircuitPatterns(input).some(m=>m.patternId==='driver-return'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validatePcbLayoutIntent, type PcbSchematicGroups } from '../src/pcb.ts';
import { runPcbLayoutDsl } from '../src/pcb-layout/pcb-layout-dsl/spec.ts';
import { createCircuitPatternContext } from '../src/pcb-layout/intent-validation/recognition/context.ts';
import { matchCircuitPattern } from '../src/pcb-layout/intent-validation/recognition/match.ts';
import { circuitPatternRegistry } from '../src/pcb-layout/intent-validation/registry.ts';
import type { ExplainCircuit } from '../src/types/circuit.ts';

const component = (designator: string, pins: string) => ({ designator, value: 'test', part_uuid: null,
    pins: pins.split(' ').map((pair, i) => { const [name, signal_name] = pair.split('='); return { pin_number: i + 1, name, signal_name }; }) });
const cap = (name: string, net: string) => component(name, '1=' + net + ' 2=g');
const ldo: ExplainCircuit = { components: [component('U1', 'IN=vi OUT=vo GND=g'), cap('C1', 'vi'), cap('C2', 'vo'),
    component('U2', 'VDD=vo GND=g'), cap('C3', 'vo')] };
const code = 'block("ldo",["U1","C1","C2"]); block("load",["U2","C3"]);';
const findings = (dsl: string, circuit = ldo) => validatePcbLayoutIntent({ code: dsl, circuit });
const matches = (dsl: string, circuit: ExplainCircuit, id: string, groups?: PcbSchematicGroups) => {
    const ctx = createCircuitPatternContext({ circuit }, runPcbLayoutDsl(dsl), groups);
    return matchCircuitPattern(ctx, circuitPatternRegistry.find(p => p.id === id)!);
};
test('LDO uses its own rail capacitors; a dedicated block suffices for ordinary locality', () => {
    const result = matches(code, ldo, 'ldo-caps');
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].components, ['C1', 'C2', 'U1']);
    assert.equal(findings(code).some(d => d.code === 'PCB_INTENT_LDO_CAPS'), false);
});
test('explicit owner overrides a bad family assignment and prevents takeover by another consumer', () => {
    const dsl = 'block("ldo",["U1","C1","C2","C3"]); block("load",["U2"]); bypass(["C3"],pin("U2",1));';
    assert.deepEqual(matches(dsl, ldo, 'ldo-caps').map(m => m.roles.outputCap), ['C2']);
    assert.equal(findings(dsl).some(d => d.code === 'PCB_INTENT_SHARED_RAIL_CONSUMERS' && d.context?.components?.includes('C3') && d.context?.components?.includes('U1')), false);
});
test('component attraction establishes an owner without establishing critical pad locality', () => {
    const dsl = 'block("ldo",["U1","C1","C2","C3"]); block("load",["U2"]); near(comp("C3"),comp("U2"));';
    assert.deepEqual(matches(dsl, ldo, 'ldo-caps').map(m => m.roles.outputCap), ['C2']);
});
test('unrelated block membership cannot invalidate an explicit electrical assignment', () => {
    const dsl = 'block("ldo",["U1","C1"]); block("load",["U2","C2","C3"]); bypass(["C2"],pin("U1",2));';
    assert.deepEqual(matches(dsl, ldo, 'ldo-caps').map(m => m.roles.outputCap), ['C2']);
    assert.equal(findings(dsl).some(d => d.code === 'PCB_INTENT_LDO_CAPS'), false);
});
test('nested satellites inherit their top-level functional family', () => {
    const dsl = 'block("ldo",["U1"]); block("caps",["C1"],"power",{placement:"satellite",attachTo:"ldo"});' +
        'block("output",["C2"],"power",{placement:"satellite",attachTo:"caps"}); block("load",["U2","C3"]);';
    const ctx = createCircuitPatternContext({ circuit: ldo }, runPcbLayoutDsl(dsl));
    assert.equal(ctx.environment.familyOf.get('C2'), 'ldo');
    assert.equal(findings(dsl).some(d => d.code === 'PCB_INTENT_LDO_CAPS'), false);
});
for (const [id, anchorPins] of [
    ['driver-decoupling', 'VDD=v GND=g OUT=drive IN=input'],
    ['filtered-supply', 'VDD=v GND=g'],
    ['internal-regulator-cap', 'VCAP=v GND=g'],
] as const) test(id + ' applies the same ownership filter', () => {
    const circuit = { components: [component('U1', anchorPins), cap('C1', 'v'), component('U2', 'VDD=v GND=g'), cap('C2', 'v'),
        { ...component('R1', '1=raw 2=v'), value: 'supply-filter' }] };
    const dsl = 'block("main",["U1","C1","R1"]); block("load",["U2","C2"]); bypass(["C2"],pin("U2",1));';
    const result = matches(dsl, circuit, id).filter(m => Object.entries(m.roles).some(([role, name]) => role !== 'cap' && name === 'U1'));
    assert.ok(result.length);
    assert.ok(result.every(m => m.roles.cap === 'C1'));
});
test('buck input capacitors use the core family while switch-loop obligations remain explicit', () => {
    const circuit = { components: [component('U1', 'VIN=vi SW=sw GND=g'), component('L1', '1=sw 2=vo'), cap('C1', 'vi'),
        component('U2', 'VDD=vi GND=g'), cap('C2', 'vi')] };
    const dsl = 'block("buck",["U1","L1"]); block("input",["C1"],"power",{placement:"satellite",attachTo:"buck"}); block("load",["U2","C2"]);';
    const result = matches(dsl, circuit, 'buck-loop');
    assert.ok(result.length);
    assert.ok(result.every(m => m.components.includes('C1') && !m.components.includes('C2')));
    assert.ok(findings(dsl, circuit).some(d => d.code === 'PCB_INTENT_BUCK_LOOP'));
});
test('unique signal topology survives incorrect separate blocks', () => {
    const circuit = { components: [component('U1', 'OSCIN=xi OSCOUT=xo GND=g'), component('Y1', '1=xi 2=xo'), cap('C1', 'xi'), cap('C2', 'xo')] };
    const dsl = 'block("controller",["U1"]); block("wrong",["Y1","C1","C2"]);';
    assert.ok(matches(dsl, circuit, 'crystal').length);
    assert.ok(findings(dsl, circuit).some(d => d.code === 'PCB_INTENT_CRYSTAL'));
});
test('a uniquely connected VCAP capacitor survives an incorrect family boundary', () => {
    const circuit = { components: [component('U1', 'VCAP=internal GND=g'), cap('C1', 'internal'), component('U2', 'VDD=v GND=g')] };
    const dsl = 'block("main",["U1"]); block("wrong",["U2","C1"],"generic",{allowDisconnected:true});';
    assert.ok(matches(dsl, circuit, 'internal-regulator-cap').length);
    assert.ok(findings(dsl, circuit).some(d => d.code === 'PCB_INTENT_INTERNAL_REGULATOR_CAP'));
});
test('ownership filtering also works when a pattern lists its passives before its IC', () => {
    const ctx = createCircuitPatternContext({ circuit: ldo }, runPcbLayoutDsl(code));
    const definition = circuitPatternRegistry.find(p => p.id === 'ldo-caps')!;
    const result = matchCircuitPattern(ctx, { ...definition, nodes: [...definition.nodes!.slice(1), definition.nodes![0]] });
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].components, ['C1', 'C2', 'U1']);
});
test('a receiver in the same motif cannot donate its bypass capacitor to an oscillator', () => {
    const circuit = { components: [{ ...component('U1', 'VDD=v GND=g OUT=clk'), value: 'oscillator' }, cap('C1', 'v'),
        component('U2', 'CLKIN=clk VDD=v GND=g'), cap('C2', 'v')] };
    const dsl = 'block("all",["U1","U2","C1","C2"]); bypass(["C1"],pin("U1",1)); bypass(["C2"],pin("U2",2));';
    const result = matches(dsl, circuit, 'active-oscillator');
    assert.ok(result.length);
    assert.ok(result.every(m => m.roles.cap === 'C1'));
});
test('equivalent rail capacitors produce one finding and satisfying alternatives remove it', () => {
    const circuit = { components: [...ldo.components, cap('C4', 'vi'), cap('C5', 'vo')] };
    const dsl = 'block("all",["U1","U2","C1","C2","C3","C4","C5"]);';
    assert.equal(findings(dsl, circuit).filter(d => d.code === 'PCB_INTENT_LDO_CAPS').length, 1);
    assert.equal(findings(dsl + 'bypass(["C1"],pin("U1",1)); bypass(["C2"],pin("U1",2));', circuit).filter(d => d.code === 'PCB_INTENT_LDO_CAPS').length, 0);
});
test('different capacitors cannot supply opposite ends of a critical loop alternative', () => {
    const circuit = { components: [component('U1', 'VDD=v GND=g OUT=drive IN=input'), cap('C1', 'v'), cap('C2', 'v')] };
    const dsl = 'block("driver",["U1","C1","C2"]); criticalPair(pin("U1",1),pin("C1",1)); criticalPair(pin("U1",2),pin("C2",2));';
    assert.equal(findings(dsl, circuit).filter(d => d.code === 'PCB_INTENT_DRIVER_DECOUPLING').length, 1);
    assert.equal(findings(dsl + 'criticalPair(pin("U1",2),pin("C1",2));', circuit).filter(d => d.code === 'PCB_INTENT_DRIVER_DECOUPLING').length, 0);
});
test('a board-sized single family cannot hide ordinary locality warnings', () => {
    const circuit = { components: [ldo.components[0], ...Array.from({ length: 13 }, (_, i) => cap('C' + (i + 1), i === 0 ? 'vi' : 'vo'))] };
    const dsl = 'block("all",["U1"]);' + circuit.components.slice(1).map(c =>
        'block(' + JSON.stringify(c.designator) + ',' + JSON.stringify([c.designator]) + ',"power",{placement:"satellite",attachTo:"all"});').join('');
    assert.equal(findings(dsl, circuit).filter(d => d.code === 'PCB_INTENT_LDO_CAPS').length, 1);
});
test('rigid grouping cannot substitute for assignments to each supply pin', () => {
    const circuit = { components: [component('U1', 'VDD=v VDD=v GND=g'), cap('C1', 'v'), cap('C2', 'v')] };
    const dsl = 'block("main",["U1","C1","C2"],"mcu",{localLayout:{U1:{x:0,y:0},C1:{x:2,y:0},C2:{x:3,y:0}}}); bypass(["C1","C2"],pin("U1",1));';
    assert.ok(findings(dsl, circuit).some(d => d.code === 'PCB_INTENT_DISTRIBUTED_SUPPLY' && d.message.includes('U1.2')));
});
test('STM32 regression has no LDO findings and U2 never takes MCU/transceiver capacitors', () => {
    const path = new URL('./pcb-layout/STM32G0_CAN_RS485/', import.meta.url);
    const dsl = readFileSync(new URL('STM32G0_CAN_RS485.js', path), 'utf8');
    const circuit = JSON.parse(readFileSync(new URL('STM32G0_CAN_RS485.json', path), 'utf8'));
    const result = matches(dsl, circuit, 'ldo-caps');
    assert.ok(result.length);
    assert.ok(result.every(m => m.components.every(c => ['U2', 'C7', 'C8', 'C9'].includes(c))));
    assert.equal(findings(dsl, circuit).filter(d => d.code === 'PCB_INTENT_LDO_CAPS').length, 0);
});
test('optional schematic groups compare families, leave warnings unchanged and do not mutate input', () => {
    const dsl = 'block("main",["U1"]); block("caps",["C1","C2"],"power",{placement:"satellite",attachTo:"main"}); block("load",["U2","C3"]);';
    const input = { code: dsl, circuit: ldo };
    const groups = { groups: [{ components: ['U1', 'C1', 'C2'] }, { components: ['U2', 'C3'] }] };
    const original = structuredClone({ input, groups });
    assert.equal(validatePcbLayoutIntent(input, groups).some(d => d.code === 'PCB_SCHEMATIC_GROUP_MISMATCH'), false);
    const mismatch = validatePcbLayoutIntent(input, { groups: [{ components: ['U1', 'C3'] }] });
    assert.equal(mismatch.filter(d => d.code === 'PCB_SCHEMATIC_GROUP_MISMATCH' && d.severity === 'info').length, 1);
    assert.deepEqual(mismatch.filter(d => d.severity !== 'info'), validatePcbLayoutIntent(input).filter(d => d.severity !== 'info'));
    assert.deepEqual({ input, groups }, original);
});
test('overlapping, duplicate, unknown and giant schematic groups are handled conservatively', () => {
    const input = { code, circuit: ldo };
    for (const groups of [[{ components: ['U1', 'C3'] }, { components: ['U1', 'C1'] }], [{ components: ['U1', 'C3', 'UNKNOWN'] }]]) {
        assert.equal(validatePcbLayoutIntent(input, { groups }).some(d => d.code === 'PCB_SCHEMATIC_GROUP_MISMATCH'), false);
    }
    assert.equal(validatePcbLayoutIntent(input, { groups: [{ components: ['U1', 'C3'] }, { components: ['C3', 'U1'] }] }).filter(d => d.code === 'PCB_SCHEMATIC_GROUP_MISMATCH').length, 1);
    const circuit = { components: [...ldo.components, ...Array.from({ length: 10 }, (_, i) => cap('C' + (i + 10), 'vo'))] };
    const dsl = code + 'block("extras",' + JSON.stringify(circuit.components.slice(5).map(c => c.designator)) + ');';
    assert.equal(validatePcbLayoutIntent({ code: dsl, circuit }, { groups: [{ components: circuit.components.map(c => c.designator) }] }).some(d => d.code === 'PCB_SCHEMATIC_GROUP_MISMATCH'), false);
    assert.ok(validatePcbLayoutIntent(input, { groups: [], incomplete: true }).some(d => d.code === 'PCB_SCHEMATIC_GROUP_COVERAGE' && d.severity === 'info'));
});
test('backend component arrays do not interpret EasyEDA multipart references', () => {
    const input = { code, circuit: ldo };
    assert.equal(validatePcbLayoutIntent(input, { groups: [{ components: ['U1.1', 'C3'] }] }).some(d => d.code === 'PCB_SCHEMATIC_GROUP_MISMATCH'), false);
    assert.equal(validatePcbLayoutIntent(input, { groups: [{ components: ['U1', 'C3'] }] }).filter(d => d.code === 'PCB_SCHEMATIC_GROUP_MISMATCH').length, 1);
});

const island = (net: string | null, ...refs: Array<[string, number]>): NonNullable<PcbSchematicGroups['wireIslands']>[number] =>
    ({ net, pins: refs.map(([designator, pin_number]) => ({ designator, pin_number })) });
const ldoWires: PcbSchematicGroups = { groups: [], wireIslands: [island('vo', ['U1', 2], ['C2', 1]), island('vo', ['U2', 1], ['C3', 1])] };
const catchAll = 'block("all",["U1","U2","C1","C2","C3"]);';
test('separate wire islands on the same named rail identify different local consumers', () => {
    assert.deepEqual(matches(catchAll, ldo, 'ldo-caps', ldoWires).map(m => m.roles.outputCap), ['C2']);
    const reversed = { groups: [], wireIslands: [...ldoWires.wireIslands!].reverse().map(i => ({ ...i, pins: [...i.pins].reverse() })) };
    assert.deepEqual(validatePcbLayoutIntent({ code: catchAll, circuit: ldo }, reversed), validatePcbLayoutIntent({ code: catchAll, circuit: ldo }, ldoWires));
});
for (const [id, pins] of [['driver-decoupling', 'VDD=v GND=g OUT=drive IN=input'], ['internal-regulator-cap', 'VCAP=v GND=g'], ['filtered-supply', 'VDD=v GND=g']] as const)
    test(id + ' uses the shared wire ownership index', () => {
        const circuit = { components: [component('U1', pins), cap('C1', 'v'), component('U2', 'VDD=v GND=g'), cap('C2', 'v'),
            { ...component('R1', '1=raw 2=v'), value: 'supply-filter' }] };
        const dsl = 'block("all",["U1","U2","C1","C2","R1"]);';
        const groups = { groups: [], wireIslands: [island('v', ['U1', 1], ['C1', 1]), island('v', ['U2', 1], ['C2', 1])] };
        const result = matches(dsl, circuit, id, groups).filter(m => Object.entries(m.roles).some(([role, name]) => role !== 'cap' && name === 'U1'));
        assert.ok(result.length);
        assert.ok(result.every(m => m.roles.cap === 'C1'));
        if (id === 'driver-decoupling') assert.ok(validatePcbLayoutIntent({ code: dsl, circuit }, groups).some(d => d.code === 'PCB_INTENT_DRIVER_DECOUPLING'));
    });
test('wire ownership crosses an incorrect DSL family but produces advisory info', () => {
    const dsl = 'block("main",["U1","C1"]); block("wrong",["U2","C2","C3"]);';
    const result = matches(dsl, ldo, 'ldo-caps', ldoWires);
    assert.deepEqual(result.map(m => m.roles.outputCap), ['C2']);
    const findings = validatePcbLayoutIntent({ code: dsl, circuit: ldo }, ldoWires);
    assert.ok(findings.some(d => d.code === 'PCB_SCHEMATIC_WIRE_FAMILY_MISMATCH' && d.severity === 'info'));
    assert.ok(findings.some(d => d.code === 'PCB_INTENT_LDO_CAPS'), 'wire connection alone is not PCB locality');
});
test('explicit ownership takes precedence; a contradiction with wires is info only', () => {
    const input = { code: code + 'bypass(["C3"],pin("U1",2));', circuit: ldo };
    const diagnostics = validatePcbLayoutIntent(input, ldoWires);
    assert.ok(matches(input.code, ldo, 'ldo-caps', ldoWires).some(m => m.roles.outputCap === 'C3'));
    assert.equal(diagnostics.filter(d => d.code === 'PCB_SCHEMATIC_WIRE_OWNER_MISMATCH' && d.severity === 'info').length, 1);
    assert.equal(diagnostics.some(d => d.severity === 'error'), false);
});
test('ambiguous, incomplete, ground and electrically inconsistent islands do not choose an owner', () => {
    for (const wireIslands of [
        [island('vo', ['U1', 2], ['U2', 1], ['C2', 1])],
        [island('g', ['U2', 2], ['C2', 2])],
        [island('wrong-net', ['U2', 1], ['C2', 1])],
        [island(null, ['U2', 2], ['C2', 1])],
        [island('vo', ['UNKNOWN', 1], ['U2', 1], ['C2', 1])],
        [island('vo', ['U1', 2], ['C2', 1]), island('vo', ['U2', 1], ['C2', 1])],
    ]) {
        assert.deepEqual(matches(code, ldo, 'ldo-caps', { groups: [], wireIslands }), matches(code, ldo, 'ldo-caps'));
    }
    assert.deepEqual(matches(code, ldo, 'ldo-caps', { ...ldoWires, incomplete: true }), matches(code, ldo, 'ldo-caps'));
});
test('oversized wire islands abstain and null net names use verified schematic connectivity', () => {
    const circuit = { components: [...ldo.components, ...Array.from({ length: 11 }, (_, i) => cap('C' + (i + 10), 'vo'))] };
    const dsl = code + 'block("extras",' + JSON.stringify(circuit.components.slice(5).map(c => c.designator)) + ');';
    const large = { groups: [], wireIslands: [island('vo', ['U2', 1], ['C2', 1], ...circuit.components.slice(5).map(c => [c.designator, 1] as [string, number]))] };
    assert.deepEqual(matches(dsl, circuit, 'ldo-caps', large), matches(dsl, circuit, 'ldo-caps'));
    assert.deepEqual(matches(catchAll, ldo, 'ldo-caps', { groups: [], wireIslands: ldoWires.wireIslands!.map(i => ({ ...i, net: null })) }), matches(catchAll, ldo, 'ldo-caps', ldoWires));
});
test('heuristic and wire family evidence do not repeat the same grouping finding', () => {
    const dsl = 'block("main",["U1","C1"]); block("wrong",["U2","C2","C3"]);';
    const diagnostics = validatePcbLayoutIntent({ code: dsl, circuit: ldo }, { ...ldoWires, groups: [{ components: ['U1', 'C2'] }] });
    assert.equal(diagnostics.filter(d => d.code === 'PCB_SCHEMATIC_GROUP_MISMATCH').length, 1);
    assert.equal(diagnostics.filter(d => d.code === 'PCB_SCHEMATIC_WIRE_FAMILY_MISMATCH').length, 0);
});
test('wire islands do not replace separate supply-pin assignments', () => {
    const circuit = { components: [component('U1', 'VDD=v VDD=v GND=g'), cap('C1', 'v'), cap('C2', 'v')] };
    const dsl = 'block("main",["U1","C1","C2"]); bypass(["C1","C2"],pin("U1",1));';
    const groups = { groups: [], wireIslands: [island('v', ['U1', 1], ['U1', 2], ['C1', 1], ['C2', 1])] };
    assert.ok(validatePcbLayoutIntent({ code: dsl, circuit }, groups).some(d => d.code === 'PCB_INTENT_DISTRIBUTED_SUPPLY' && d.message.includes('U1.2')));
    const original = structuredClone(groups);
    validatePcbLayoutIntent({ code: dsl, circuit }, groups);
    assert.deepEqual(groups, original);
});

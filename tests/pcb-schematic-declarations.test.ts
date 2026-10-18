import assert from 'node:assert/strict';
import test from 'node:test';
import { pcbLayoutDslSkeleton, validatePcbLayoutIntent, type PcbSchematicGroups } from '../src/pcb.ts';
import type { ExplainCircuit } from '../src/types/circuit.ts';

const component = (designator: string, pins: string) => ({ designator, value: 'test', part_uuid: null,
    pins: pins.split(' ').map((pair, i) => { const [name, signal_name] = pair.split('='); return { pin_number: i + 1, name, signal_name }; }) });
const cap = (name: string, net: string) => component(name, '1=' + net + ' 2=g');
const circuit: ExplainCircuit = { components: [component('U1', 'IN=vi OUT=vo GND=g'), cap('C1', 'vi'), cap('C2', 'vo'),
    component('U2', 'VDD=vo GND=g'), cap('C3', 'vo')] };
const code = 'block("ldo",["U1"],"power"); block("ldo_caps",["C1","C2"],"power",{placement:"satellite",attachTo:"ldo"});'
    + 'block("load",["U2","C3"]); module("supply",["ldo","ldo_caps"]);';
const declared = (blocks: NonNullable<PcbSchematicGroups['declarations']>['blocks'], incomplete?: boolean): PcbSchematicGroups =>
    ({ groups: [], declarations: { blocks, ...(incomplete ? { incomplete } : {}) } });
const own = (groups?: PcbSchematicGroups, dsl = code) => validatePcbLayoutIntent({ code: dsl, circuit }, groups)
    .filter(d => d.code.startsWith('PCB_SCHEMATIC_DECLAR'));
const matching = [
    { name: 'ldo', components: ['U1'], module: 'supply', role: 'power' },
    { name: 'ldo_caps', components: ['C1', 'C2'], module: 'supply', attachTo: 'ldo' },
    { name: 'load', components: ['C3', 'U2'] },
];

test('without declarations nothing changes; a DSL that follows them gets no finding', () => {
    assert.deepEqual(validatePcbLayoutIntent({ code, circuit }, { groups: [] }), validatePcbLayoutIntent({ code, circuit }));
    assert.deepEqual(own(declared(matching)), []);
});

test('DSL contradictions with declared blocks are warnings, never errors', () => {
    const findings = own(declared([
        { name: 'ldo', components: ['U1', 'C3'], module: 'core', role: 'mcu' },
        { name: 'ldo_caps', components: ['C1', 'C2'], attachTo: 'load' },
        { name: 'missing', components: ['U2'], attachTo: 'nowhere' },
    ]));
    assert.ok(findings.length >= 5);
    assert.ok(findings.every(d => d.severity === 'warning'));
    const codes = findings.map(d => d.code);
    for (const expected of ['PCB_SCHEMATIC_DECLARED_BLOCK_MEMBERS', 'PCB_SCHEMATIC_DECLARED_BLOCK_MODULE',
        'PCB_SCHEMATIC_DECLARED_BLOCK_ROLE', 'PCB_SCHEMATIC_DECLARED_BLOCK_ATTACH']) assert.ok(codes.includes(expected), expected);
    assert.ok(findings.some(d => d.message.includes('declared with C3')));
    assert.ok(findings.some(d => d.message.includes('has no block with that name')));
});

test('oversized declarations, incomplete reads and malformed input are reported without breaking validation', () => {
    const many = { components: [...circuit.components, ...Array.from({ length: 12 }, (_, i) => cap('C' + (i + 10), 'vo'))] };
    const big = validatePcbLayoutIntent({ code: code + 'block("extra",' + JSON.stringify(many.components.slice(5).map(c => c.designator)) + ');', circuit: many },
        declared([{ name: 'extra', components: many.components.slice(4).map(c => c.designator) }]));
    assert.ok(big.some(d => d.code === 'PCB_SCHEMATIC_DECLARED_BLOCK_SIZE' && d.severity === 'warning'));
    assert.ok(own(declared(matching, true)).some(d => d.code === 'PCB_SCHEMATIC_DECLARATION_COVERAGE' && d.severity === 'info'));
    const broken = validatePcbLayoutIntent({ code, circuit }, { groups: [], declarations: { blocks: null as never } });
    assert.ok(broken.some(d => d.code === 'PCB_SCHEMATIC_DECLARATION_CHECK' && d.severity === 'info'));
    assert.deepEqual(broken.filter(d => !d.code.startsWith('PCB_SCHEMATIC_DECLAR')), validatePcbLayoutIntent({ code, circuit }));
});

test('the skeleton is valid DSL for the declared hierarchy', () => {
    const skeleton = pcbLayoutDslSkeleton({ blocks: matching });
    assert.equal(skeleton.code, [
        'block("ldo", ["U1"], "power");',
        'block("ldo_caps", ["C1","C2"], "generic", { placement: "satellite", attachTo: "ldo" });',
        'block("load", ["C3","U2"], "generic");',
        'module("supply", ["ldo","ldo_caps"]);',
    ].join('\n') + '\n');
    assert.deepEqual(skeleton.diagnostics, []);
    const result = validatePcbLayoutIntent({ code: skeleton.code, circuit }, declared(matching));
    assert.equal(result.some(d => d.severity === 'error'), false);
    assert.deepEqual(result.filter(d => d.code.startsWith('PCB_SCHEMATIC_DECLAR')), []);
});

test('the skeleton reports unusable roles and attachments and never throws', () => {
    const skeleton = pcbLayoutDslSkeleton({ blocks: [{ name: 'a', components: ['U1'], role: 'motor', attachTo: 'b' }] });
    assert.equal(skeleton.code, 'block("a", ["U1"], "generic");\n');
    assert.deepEqual(skeleton.diagnostics.map(d => d.code), ['PCB_SCHEMATIC_DECLARED_BLOCK_ROLE', 'PCB_SCHEMATIC_DECLARED_BLOCK_ATTACH']);
    assert.deepEqual(pcbLayoutDslSkeleton(undefined), { code: '', diagnostics: [] });
    const broken = pcbLayoutDslSkeleton({ blocks: [{ name: 'a', components: null as never }] });
    assert.equal(broken.code, '');
    assert.equal(broken.diagnostics[0].code, 'PCB_SCHEMATIC_DECLARATION_CHECK');
});

test('a component declared in several blocks gets one conflict warning and stays out of the skeleton', () => {
    const blocks = [{ name: 'ldo', components: ['U1', 'C1'] }, { name: 'ldo_caps', components: ['C1', 'C2'] }, { name: 'load', components: ['C3', 'U2'] }];
    const findings = own(declared(blocks));
    assert.deepEqual(findings.map(d => d.code), ['PCB_SCHEMATIC_DECLARED_BLOCK_CONFLICT']);
    assert.ok(findings.every(d => d.severity === 'warning'));
    assert.deepEqual(findings[0].context?.components, ['C1']);
    const skeleton = pcbLayoutDslSkeleton({ blocks });
    assert.ok(!skeleton.code.includes('"C1"'));
    assert.deepEqual(skeleton.diagnostics.map(d => d.code), ['PCB_SCHEMATIC_DECLARED_BLOCK_CONFLICT']);
    const result = validatePcbLayoutIntent({ code: skeleton.code, circuit: { components: circuit.components.filter(c => c.designator !== 'C1') } });
    assert.equal(result.some(d => d.severity === 'error'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { detectCircuitPatterns, validatePcbLayoutIntent } from '../src/pcb.ts';
import type { ValidatePcbLayoutIntentInput } from '../src/pcb.ts';

const connector = (designator: string) => ({ designator, value: 'test', part_uuid: null,
    pins: [{ pin_number: '1', name: '1', signal_name: 'signal' }] });
const circuit = { components: [connector('J1')] };
const board = 'board.rect(100,60);';
const block = 'block("port",["J1"]);';
const validate = (code: string, input: Partial<ValidatePcbLayoutIntentInput> = {}) => {
    const diagnostics = validatePcbLayoutIntent({ code, circuit, ...input });
    assert.equal(diagnostics.some(d => d.severity === 'error'), false, JSON.stringify(diagnostics));
    return diagnostics.filter(d => d.code === 'PCB_INTENT_CONNECTOR_PLACEMENT');
};
const footprint = { name: 'connector', width: 20, height: 4, pads: [] };

test('connector recognition is reusable, per component, ordered and independent of connected pin names', () => {
    const input = { circuit: { components: [connector('J2'), connector('P1'), connector('CN1'), connector('J1'), connector('U1')] } };
    const original = structuredClone(input);
    const matches = detectCircuitPatterns(input).filter(m => m.patternId === 'connector-placement');
    assert.deepEqual(input, original);
    assert.equal(matches.length, 4);
    assert.deepEqual(matches.map(m => m.components[0]), ['CN1', 'J1', 'J2', 'P1']);
    assert.ok(matches.every(m => m.requirements.some(r => r.relation === 'connector-placement' && r.source === m.roles.connector && r.maxEdgeDistance === 5)));
    input.circuit.components.reverse().forEach(c => c.pins.forEach(p => p.signal_name = ''));
    assert.deepEqual(detectCircuitPatterns(input).filter(m => m.patternId === 'connector-placement'), matches);
    assert.deepEqual(original.circuit.components.map(c => c.designator), ['J2', 'P1', 'CN1', 'J1', 'U1']);
});

test('connector placement emits warning with English message, component context', () => {
    const [diagnostic] = validate(board + '\n' + block);
    assert.equal(diagnostic.severity, 'warning');
    assert.match(diagnostic.message, /no fixed or mechanical edge placement/);
    assert.deepEqual(diagnostic.context?.components, ['J1']);
});

test('block membership, localLayout and soft edge hints do not fix a connector', () => {
    for (const code of [block, block + 'edge(comp("J1"),"left");',
        'block("port",["J1"],"connector",{localLayout:{J1:{x:0,y:0}}});']) {
        assert.equal(validate(board + code).length, 1, code);
    }
});

test('explicit edge mounts, sliding mounts and edge placement bind connector mechanics', () => {
    for (const code of ['edgeMount("J1","left");', 'edgeMount("J1","right",{slide:true});',
        'edgePlace("J1",{edge:"bottom"});', 'edgePlace("J1",{edges:["left","right"],inset:5});']) {
        assert.deepEqual(validate(block + code), [], code);
    }
    assert.match(validate(block + 'edgePlace("J1",{edge:"left",inset:20});')[0].message, /inset of 20 mm/);
});

test('fixed center is warned even with a soft edge hint; fixed near the perimeter passes', () => {
    assert.match(validate(board + block + 'fixed("J1",{x:0,y:0}); edge(comp("J1"),"left");')[0].message, /30\.00 mm.*component center; footprint unavailable/);
    for (const [x, y] of [[-46, 0], [46, 0], [0, -26], [0, 26]]) {
        assert.deepEqual(validate(board + block + `fixed("J1",{x:${x},y:${y}});`), []);
    }
});

test('fixed anchor positions, overrides and offsets use the shared placement resolver', () => {
    assert.deepEqual(validate(board + block + 'fixed("J1",{anchor:anchor("board.left"),offset:{x:3}});'), []);
    assert.equal(validate(board + block + 'fixed("J1",{anchor:anchor("board.left"),offset:{x:20}});').length, 1);
    assert.equal(validate(board + block + 'fixed("J1",{anchor:anchor("board.left"),x:0});').length, 1);
    assert.equal(validate(board + block + 'fixed("J1",{anchor:anchor("board.center")});').length, 1);
});

test('footprint dimensions and rotation measure the bounding box rather than just the center', () => {
    const input = { footprints: { J1: footprint } };
    assert.deepEqual(validate(board + block + 'fixed("J1",{x:36,y:0,rotate:0});', input), []);
    assert.equal(validate(board + block + 'fixed("J1",{x:36,y:0,rotate:90});', input).length, 1);
    assert.deepEqual(validate(board + block + 'fixed("J1",{x:0,y:16,rotate:90,layer:"bottom"});', input), []);
    assert.match(validate(board + block + 'fixed("J1",{x:0,y:0});', input)[0].message, /28\.00 mm.*footprint bounding box/);
});

test('the 5 mm guideline uses the shared 0.001 mm geometry tolerance', () => {
    assert.deepEqual(validate(board + block + 'fixed("J1",{x:45,y:0});'), []);
    assert.deepEqual(validate(board + block + 'fixed("J1",{x:44.9995,y:0});'), []);
    assert.equal(validate(board + block + 'fixed("J1",{x:44.998,y:0});').length, 1);
});

test('a fixed position with auto-sized board reports unavailable edge proximity as a warning', () => {
    const [diagnostic] = validate(block + 'fixed("J1",{x:0,y:0});');
    assert.equal(diagnostic.severity, 'warning');
    assert.match(diagnostic.message, /cannot be checked without an explicit board outline/);
});

test('incomplete fixed intent produces a warning instead of throwing from geometry', () => {
    assert.match(validate(board + block + 'fixed("J1",{x:3});')[0].message, /does not define a complete position/);
});

const notched = [{ x: -50, y: -30 }, { x: 50, y: -30 }, { x: 50, y: 30 }, { x: 10, y: 30 },
    { x: 10, y: 0 }, { x: -10, y: 0 }, { x: -10, y: 30 }, { x: -50, y: 30 }];
const polygonDsl = (points = notched) => 'board.polygon(' + JSON.stringify(points) + ');';

test('polygon checks use actual cutout edges rather than the board bounding rectangle', () => {
    assert.deepEqual(validate(polygonDsl() + block + 'fixed("J1",{x:0,y:-4});'), []);
    assert.equal(validate(polygonDsl() + block + 'fixed("J1",{x:-30,y:0});').length, 1);
    // A cutout edge ends inside this footprint's bounding box; corner sampling alone would miss it.
    const enclosing = { footprints: { J1: { ...footprint, width: 30, height: 10 } } };
    assert.deepEqual(validate(polygonDsl() + block + 'fixed("J1",{x:0,y:0});', enclosing), []);
});

test('polygon centering preserves a large source-coordinate offset before F32 geometry', () => {
    const points = notched.map(p => ({ x: p.x + 1_000_000, y: p.y - 2_000_000 }));
    assert.deepEqual(validate(polygonDsl(points) + block + 'fixed("J1",{x:1000000,y:-2000004});'), []);
    assert.equal(validate(polygonDsl(points) + block + 'fixed("J1",{x:999970,y:-2000000});').length, 1);
    assert.deepEqual(validate(polygonDsl(points) + block + 'fixed("J1",{anchor:anchor("board.left"),offset:{x:3}});'), []);
});

test('preserved connectors retain their real positions and override authored fixed intent', () => {
    const existingPlacement = { board: { polygon: [{ x: -50, y: -30 }, { x: 50, y: -30 }, { x: 50, y: 30 }, { x: -50, y: 30 }] },
        components: [{ designator: 'J1', x: 48, y: 0, rotate: 0, layer: 'top' as const }] };
    const input = { existingPlacement };
    assert.deepEqual(validate('preserve({board:true,components:"all"});', input), []);
    const moved = structuredClone(input);
    moved.existingPlacement.components[0].x = 0;
    assert.equal(validate('preserve({board:true,components:["J1"]}); fixed("J1",{anchor:anchor("board.left")});', moved).length, 1);
    assert.equal(validate(board + block, input).length, 1, 'supplying existing data without preserve must not fix a connector');
});

test('preserved footprint source origin and board source coordinates are normalized together', () => {
    const input = { existingPlacement: { board: { polygon: [{ x: 1000, y: 2000 }, { x: 1100, y: 2000 }, { x: 1100, y: 2060 }, { x: 1000, y: 2060 }] },
        components: [{ designator: 'J1', x: 1080, y: 2030, rotate: 0, layer: 'top' as const }] },
        footprints: { J1: { ...footprint, sourceOriginOffset: { x: -8, y: 0 } } } };
    assert.deepEqual(validate('preserve({board:true,components:"all"});', input), []);
});

test('explicit DSL connector roles recognize USB and header designators without broadening other electrical motifs', () => {
    const input = { circuit: { components: [connector('USB1'), connector('H1'), connector('SW1'), connector('U1')] } };
    const code = 'block("parts",["USB1","H1","SW1","U1"]); component("USB1").role("connector"); component("H1").role("connector");';
    const result = validate(code, input);
    assert.deepEqual(result.map(d => d.context?.components?.[0]).sort(), ['H1', 'USB1']);
    const matches = detectCircuitPatterns({ ...input, componentRoles: { USB1: 'connector', H1: 'connector' } });
    assert.equal(matches.filter(m => m.patternId === 'connector-placement').length, 2);
});

test('preview scope excludes unselected connectors and every unbound connector receives its own warning', () => {
    const input = { circuit: { components: [connector('J1'), connector('J2')] } };
    const code = 'block("ports",["J1","J2"]);';
    assert.equal(validate(code, input).length, 2);
    const result = validate(code + 'solver({placeOnlyComponents:["J1"]});', input);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].context?.components, ['J1']);
});

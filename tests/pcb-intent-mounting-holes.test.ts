import assert from 'node:assert/strict';
import test from 'node:test';
import { detectCircuitPatterns, validatePcbLayoutIntent } from '../src/pcb.ts';
import type { ValidatePcbLayoutIntentInput } from '../src/pcb.ts';
import { isMountingHoleComponent } from '../src/pcb-layout/intent-validation/recognition/mounting-holes.ts';

const component = (designator: string, value = 'test', footprint_name?: string) => ({
    designator, value, footprint_name, part_uuid: null,
    pins: [{ pin_number: '1', name: '1', signal_name: 'signal' }],
});
const circuit = { components: [component('U1')] };
const base = 'board.rect(40,30); block("main",["U1"]);';
const codeFor = (designators: string[]) => 'block("parts",' + JSON.stringify(designators) + ',"generic",{allowDisconnected:true});';
const findings = (code = base, input: Partial<ValidatePcbLayoutIntentInput> = {}) => {
    const diagnostics = validatePcbLayoutIntent({ code, circuit, ...input });
    assert.equal(diagnostics.some(d => d.severity === 'error'), false, JSON.stringify(diagnostics));
    return diagnostics.filter(d => d.code === 'PCB_INTENT_MOUNTING_HOLES');
};

test('missing mounting holes produce exactly one board-level English info diagnostic', () => {
    const result = findings();
    assert.deepEqual(result, [{ code: 'PCB_INTENT_MOUNTING_HOLES', severity: 'info',
        message: 'No mounting holes were identified in the provided schematic or placement DSL. Consider adding at least one mounting hole or confirm that the board is secured by another method.' }]);
    const invalid = validatePcbLayoutIntent({ code: 'board.rect(40,30);', circuit: { components: [] } });
    assert.ok(invalid.some(d => d.severity === 'error'));
    assert.equal(invalid.some(d => d.code === 'PCB_INTENT_MOUNTING_HOLES'), false);
});

test('one explicit board hole is sufficient and corner-hole declarations also satisfy presence', () => {
    assert.deepEqual(findings(base + 'boardHole("mount",{at:anchor("board.top_left"),drill:3.2});'), []);
    assert.deepEqual(findings(base + 'boardHole.corners({inset:3,drill:3.2,prefix:"MH"});'), []);
});

test('mounting-hole symbols are identified by MH designators and explicit mechanical labels', () => {
    for (const hole of [component('MH1'), component('H1', 'MountingHole_3.2mm'), component('X1', 'Mount Hole M3'),
        component('H2', 'Screw-Hole'), component('H3', 'test', 'MountingHole:MountingHole_2.2mm_M2')]) {
        hole.pins = [];
        const input = { circuit: { components: [component('U1'), hole] } };
        assert.equal(isMountingHoleComponent(hole, input), true, hole.designator);
        assert.deepEqual(findings(codeFor(['U1', hole.designator]), input), []);
    }
});

test('provided footprint names and verified mounting-hole kinds are reusable recognition evidence', () => {
    const hole = component('H1');
    const input = { circuit: { components: [component('U1'), hole] },
        footprints: { H1: { name: 'MountingHole_3.2mm_M3', width: 6, height: 6, pads: [] } } };
    assert.equal(isMountingHoleComponent(hole, input), true);
    assert.deepEqual(findings(codeFor(['U1', 'H1']), input), []);
    assert.deepEqual(findings(codeFor(['U1', 'H1']), { circuit: input.circuit,
        knowledge: { components: { H1: { kind: 'mounting-hole' } } } }), []);
});

test('through-hole connector pads, solder-pad holes and via names are not mounting holes', () => {
    for (const lookalike of [component('H1', 'Header'), component('VIA1', 'Via'), component('P1', 'Round solder pads with hole 1.5mm'),
        component('H2', 'HOLE'), component('U2', 'UnmountingHoleController')]) {
        const input = { circuit: { components: [component('U1'), lookalike] },
            footprints: { [lookalike.designator]: { name: 'TH_PAD', width: 2, height: 2,
                pads: [{ pin_number: '1', x: 0, y: 0, width: 2, height: 2, mount: 'through_hole' as const, drillDiameter: 1 }] } } };
        assert.equal(isMountingHoleComponent(lookalike, input), false);
        assert.equal(findings(codeFor(['U1', lookalike.designator]), input).length, 1);
    }
    assert.equal(findings(base + 'boardPad("via",{at:anchor("board.center"),pitch:1,layer:"multi",pads:[[{name:"pad",net:"signal",shape:"round",diameter:2,hole:{diameter:0.4}}]]}); block("via",["via"]);').length, 1);
});

test('verified non-hole kinds and explicit connector roles override mounting-name heuristics', () => {
    const circuit = { components: [component('MH1', 'MountingHole')] };
    const input = { circuit, knowledge: { components: { MH1: { kind: 'connector' } } } };
    assert.equal(findings(codeFor(['MH1']), input).length, 1);
    assert.equal(findings(codeFor(['MH1']) + 'component("MH1").role("connector");', { circuit }).length, 1);
});

test('previewing only an IC does not hide mounting holes declared elsewhere on the board', () => {
    const input = { circuit: { components: [component('U1'), component('MH1')] } };
    assert.deepEqual(findings(codeFor(['U1', 'MH1']) + 'solver({placeOnlyComponents:["U1"]});', input), []);
    assert.deepEqual(findings(base + 'boardHole("mount",{at:anchor("board.center"),drill:3}); solver({preview:true});'), []);
});

test('a preserved mounting-hole component counts, but outline-only preservation does not imply holes', () => {
    const existingPlacement = { board: { polygon: [{ x: -20, y: -15 }, { x: 20, y: -15 }, { x: 20, y: 15 }, { x: -20, y: 15 }] },
        components: [{ designator: 'MH1', x: -15, y: -10, rotate: 0, layer: 'top' as const }] };
    assert.deepEqual(findings('preserve({board:true,components:"all"});', { circuit: { components: [component('MH1')] }, existingPlacement }), []);
    assert.equal(findings(base + 'preserve({board:true});', { existingPlacement: { ...existingPlacement, components: [] } }).length, 1);
});

test('board-wide recognition is deterministic and does not mutate caller inputs', () => {
    const input = { circuit: { components: [component('U1'), component('MH1')] } };
    const original = structuredClone(input);
    const matches = detectCircuitPatterns(input).filter(m => m.patternId === 'mounting-holes');
    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].requirements, [{ relation: 'mounting-holes', minimumCount: 1 }]);
    assert.deepEqual(findings(codeFor(['U1', 'MH1']), input), []);
    assert.deepEqual(input, original);
    const reversed = structuredClone(input);
    reversed.circuit.components.reverse().forEach(c => c.pins.reverse());
    assert.deepEqual(detectCircuitPatterns(reversed).filter(m => m.patternId === 'mounting-holes'), matches);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { runPcbLayout } from '../src/pcb-layout/run-pcb-layout.ts';
import { runPcbLayoutDsl } from '../src/pcb-layout/pcb-layout-dsl/spec.ts';
import { applyPlacementPreviewFilter } from '../src/pcb-layout/placement-input.ts';
import { validatePlacementRulesForCircuit } from '../src/pcb-layout/placement-validation.ts';
import { withFixedBlockPlacements, assertFixedBlockPlacements } from '../src/pcb-layout/fixed-blocks.ts';
import { encodeNativePostPlaceRefineProblem } from '../src/pcb-layout/pcb-auto-place-v2/native/encode-post-place-refine.ts';
import { loadNativeBoardPacker } from '../src/pcb-layout/pcb-auto-place-v2/native/load-native-board-packer.ts';
import type { ExplainCircuit } from '../src/types/circuit.ts';
import type { FootprintSpec } from '../src/types/pcb/layout-model.ts';

const uuid = '11111111111111111111111111111111';
const footprint: FootprintSpec = { name: 'TWO_PAD', width: 2, height: 1, pads: [
    { pin_number: '1', name: '1', x: -0.5, y: 0, width: 0.3, height: 0.3 },
    { pin_number: '2', name: '2', x: 0.5, y: 0, width: 0.3, height: 0.3 },
] };
const circuit: ExplainCircuit = { components: ['U1', 'R1', 'C1', 'R9'].map(designator => ({
    designator, value: designator === 'U1' ? 'IC' : '10k', part_uuid: uuid, footprint_name: 'TWO_PAD',
    pins: [{ pin_number: '1', name: '1', signal_name: 'SIG' }, { pin_number: '2', name: '2', signal_name: 'GND' }],
})) };
function code(local: boolean, fixed: boolean, preview: boolean) {
    return `board.rect(60, 40);
    block("power", ["U1", "R1"], "generic", {
        ${local ? 'localLayout: { U1: { x: 0, y: 0, rotate: 0 }, R1: { x: 4, y: 0, rotate: 0 } },' : ''}
        ${fixed ? 'fixed: { reference: "U1", x: 10.123456, y: -5.234567, rotate: 90 },' : ''}
    });
    block("support", ["C1"], "generic", { placement: "satellite", attachTo: "power", anchor: pin("U1", "1") });
    block("other", ["R9"], "generic", { localLayout: { R9: { x: 0, y: 0, rotate: 0 } } });
    component("U1").role("main_ic");
    near(comp("R1"), comp("R9"));
    refineGroup("try_to_move_frozen", ["U1", "R1", "C1"], { swap: true, rotateBy: [180] });
    solver({ ${preview ? 'previewBlock: "power",' : ''} grid: 0.5 });`;
}
const poses = (placements: Array<{ designator: string; x: number; y: number; rotate: number; layer: string }>) =>
    placements.filter(p => p.designator !== 'R9').map(({ designator, x, y, rotate, layer }) => ({ designator, x, y, rotate, layer })).sort((a,b) => a.designator.localeCompare(b.designator));

for (const local of [false, true]) {
    test(`block preview completes ordinary search without board packing; localLayout=${local}`, async t => {
        const native = loadNativeBoardPacker();
        // Calling the board packer would violate the feature's main performance contract.
        const packMethods = Object.keys(native).filter(k => /^(pack|solveBoard)/i.test(k));
        assert.ok(packMethods.length, 'board packer entry is covered');
        for (const key of packMethods) t.mock.method(native as any, key, () => { throw new Error('Preview must not pack the board'); });
        const missingOther = { components: circuit.components.map(c => c.designator === 'R9' ? { ...c, part_uuid: null, footprint_name: null } : c) };
        const result = await runPcbLayout({ circuit: missingOther, code: code(local, false, true), footprints: { [uuid]: footprint } });
        assert.equal(result.placementReport.ok, true, JSON.stringify(result.toolReport));
        assert.equal(result.toolReport.status, 'preview');
        assert.equal(result.boardAssemble, undefined);
        assert.equal(result.blockPreview?.coordinateFrame, 'local');
        assert.deepEqual(result.placements.map(p => p.designator).sort(), ['C1', 'R1', 'U1']);
        assert.deepEqual(result.stages.map(s => s.name), ['01-block-preview']);
        assert.match(result.placementSvg, /Block preview: power/);
        assert.ok(result.placementReport.graphReport.diagnostics.some(d => /Staged block search/.test(d.message)));
        assert.ok(result.toolReport.preview.warnings.some(w => /External/.test(w)));
    });

    test(`fixed family survives full board packing and refinement; localLayout=${local}`, async () => {
        const preview = await runPcbLayout({ circuit, code: code(local, true, true), footprints: { [uuid]: footprint } });
        const full = await runPcbLayout({ circuit, code: code(local, true, false), footprints: { [uuid]: footprint } });
        assert.equal(full.placementReport.ok, true, JSON.stringify(full.toolReport));
        assert.deepEqual(poses(full.placements), poses(preview.placements));
        const reference = full.placements.find(p => p.designator === 'U1')!;
        assert.equal(reference.x, 10.123456);
        assert.equal(reference.y, -5.234567);
        assert.equal(reference.rotate, 90);
        assert.equal(full.placementInput.components.some(c => c.pcb.fixedPlacement), false, 'authored input stays unchanged');
        const protectedInput = withFixedBlockPlacements(full.placementInput, full.placements);
        const problem = encodeNativePostPlaceRefineProblem(protectedInput, full.placements, 1);
        assert.equal(problem.components.filter(c => c.fixed).length, 3);
        assert.ok(problem.groups.every(g => g.members.every(i => protectedInput.components[i].designator === 'R9')));
        assert.doesNotThrow(() => assertFixedBlockPlacements(protectedInput, full.placements));
        assert.throws(() => assertFixedBlockPlacements(protectedInput, full.placements.map(p => p.designator === 'C1' ? { ...p, rotate: (p.rotate + 180) % 360 } : p)), /moved after locking/);
    });
}

test('preview selection rejects unknown names and competing component filters', () => {
    for (const text of ['previewBlock: "missing"', 'previewBlock: "power", placeOnlyComponents: ["U1"]', 'previewBlock: "power", ignoreComponents: ["R9"]']) {
        const rules = runPcbLayoutDsl(code(false, false, false) + `solver({${text}});`);
        assert.throws(() => applyPlacementPreviewFilter(circuit, rules), /previewBlock/);
    }
});

test('preview of a satellite excludes its parent and keeps its own localLayout', async () => {
    const result = await runPcbLayout({ circuit, code: code(false, false, false) + 'solver({previewBlock: "support"});', footprints: { [uuid]: footprint } });
    assert.equal(result.placementReport.ok, true);
    assert.deepEqual(result.placements.map(p => p.designator), ['C1']);
    assert.equal(result.rules.blocks[0].attachTo, null);
});

test('fixed rules reject ambiguous ownership, existing mechanics and preserved poses', () => {
    const base = code(false, true, false);
    for (const [text, pattern] of [
        [base.replace('reference: "U1"', 'reference: "R9"'), /reference/],
        [base + 'module("m", ["power"]);', /module/],
        [base + 'component("C1").fixed({x:0,y:0,rotate:0,layer:"top"});', /already uses/],
        [base + 'preserve({components:["U1"]});', /preserved/],
        [base.replace('fixed: {', 'placement: "satellite", attachTo: "other", fixed: {'), /root blocks/],
    ] as const) {
        assert.throws(() => validatePlacementRulesForCircuit(circuit, runPcbLayoutDsl(text)), pattern);
    }
});

test('fixed block preview reports board bounds violations without relocating the block', async () => {
    const result = await runPcbLayout({ circuit, code: code(false, true, true).replace('x: 10.123456', 'x: 80'), footprints: { [uuid]: footprint } });
    assert.equal(result.blockPreview?.placementOk, false);
    assert.equal(result.toolReport.status, 'error');
    assert.equal(result.placements.find(p => p.designator === 'U1')?.x, 80);
});

test('conflicting fixed blocks fail placement instead of moving either reference', async () => {
    const selected = { components: circuit.components.filter(c => ['U1', 'R1'].includes(c.designator)) };
    const result = await runPcbLayout({ circuit: selected, footprints: { [uuid]: footprint }, code: `
        board.rect(20,20);
        block("a", ["U1"], "generic", { fixed: {reference:"U1",x:0,y:0,rotate:0} });
        block("b", ["R1"], "generic", { fixed: {reference:"R1",x:0,y:0,rotate:0} });
    ` });
    assert.equal(result.placementReport.ok, false);
    assert.equal(result.toolReport.status, 'error');
    assert.ok(result.placements.every(p => p.x === 0 && p.y === 0));
});

test('fixed blocks reject a transform violating allowed rotations', async () => {
    await assert.rejects(runPcbLayout({ circuit, footprints: { [uuid]: footprint },
        code: code(false, true, true) + 'component("U1").rotations(0);',
    }), /disallowed final orientation/);
});

test('block preview reports an unaccepted local recovery as failure', async () => {
    const result = await runPcbLayout({ circuit, footprints: { [uuid]: footprint },
        code: code(false, false, true) + 'criticalPair(pin("U1","1"),pin("R1","1"),{maxDistance:0.001,hard:true});',
    });
    assert.equal(result.blockPreview?.placementOk, false);
    assert.equal(result.toolReport.status, 'error');
    assert.ok(result.placementReport.graphReport.diagnostics.some(d => d.severity === 'error'));
    assert.equal(result.boardAssemble, undefined);
});

test('whole-block preview retains connectivity and localLayout validation', async () => {
    await assert.rejects(runPcbLayout({ circuit, footprints: { [uuid]: footprint },
        code: code(true, false, true).replace('R1: { x: 4', 'UNKNOWN: { x: 4'),
    }), /unknown component/);
    const disconnected = { components: circuit.components.map(c => c.designator === 'R1'
        ? { ...c, pins: c.pins.map(p => ({ ...p, signal_name: 'OTHER' })) } : c) };
    await assert.rejects(runPcbLayout({ circuit: disconnected, footprints: { [uuid]: footprint }, code: code(false, false, true) }), /disconnected/);
});

test('preserve all allows a new fixed family but rejects an actually preserved member', async () => {
    const existingPlacement = {
        board: { polygon: [{ x:-30,y:-20 },{ x:30,y:-20 },{ x:30,y:20 },{ x:-30,y:20 }] },
        components: [{ designator:'R9',x:-15,y:0,rotate:0,layer:'top' as const }],
    };
    const options = { circuit, footprints: { [uuid]: footprint }, existingPlacement,
        code: code(false, true, true) + 'preserve({components:"all"});',
    };
    const result = await runPcbLayout(options);
    assert.equal(result.blockPreview?.placementOk, true);
    await assert.rejects(runPcbLayout({ ...options, existingPlacement: { ...existingPlacement,
        components: [...existingPlacement.components, { designator:'U1',x:0,y:0,rotate:0,layer:'top' }],
    } }), /independently fixed or preserved pose/);
});

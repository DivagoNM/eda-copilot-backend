import test from 'node:test';
import assert from 'node:assert/strict';
import { minimalProblem } from './helpers/native-board-problem.ts';
import { loadNativeBoardPacker } from '../src/pcb-layout/pcb-auto-place-v2/native/load-native-board-packer.ts';
import type { NativeBlockSolveProblemV4 } from '../src/pcb-layout/pcb-auto-place-v2/native/contract.ts';

test('block checkpoint evaluation uses the search score including both compactness modes', () => {
    const addon = loadNativeBoardPacker();
    for (const compactness of ['normal', 'high'] as const) for (const reducedHull of [false, true]) {
        const board = minimalProblem();
        board.primitives[0].locked = true;
        const problem: NativeBlockSolveProblemV4 = {
            version: 4, grid: board.grid, clearance: board.clearance, compactness, searchWidth: 1,
            primitives: board.primitives, relations: [], obstacles: [],
            collisionMode: 'components', hardCollisionMode: 'components', candidateBoxMode: 'bbox',
            components: board.components.map(c => ({ ...c, pinCount: 1, role: 'main_ic', powerComponent: false })),
            componentConflict: [0], componentPairClearance: [0], experiments: {reducedHull, longNets: true},
        };
        const original = structuredClone(problem);
        const quality = addon.evaluateBlockQuality(problem);
        assert.equal(quality.score, addon.solveBlockPrimitives(problem).rank.score);
        assert.deepEqual(problem, original, 'evaluation must not generate or mutate a layout');
        assert.equal(quality.electrical, 0, 'compactness must not enter electrical diagnostics');
    }
});

test('board evaluation is the packer rank, with unchanged legality and alignment terms', () => {
    const addon = loadNativeBoardPacker();
    const problem = minimalProblem();
    problem.primitives[0].locked = true;
    const before = structuredClone(problem);
    assert.deepEqual(addon.evaluateBoardQuality(problem).rank, addon.solveBoardPacked(problem).rank);
    assert.deepEqual(problem, before);
});

test('Rust classifies power names for all TS encoders, including names missed by the old prefix regexp', () => {
    const addon = loadNativeBoardPacker();
    const nets = ['+3V3', '3V3', 'VOUT', 'VSYS', 'VREF', 'VDD_IO', 'CAN_TX', 'VREG_LX', 'GND'];
    assert.deepEqual(addon.placementNetWeights(nets, false), [.25, .25, .25, .25, .25, .25, 1, 1, 1]);
    assert.deepEqual(addon.placementNetWeights(nets, true), Array(6).fill(Math.fround(.1)).concat([1,1,1]));
});

test('transferred island and orientation criteria keep their former numerical weights', () => {
    const addon = loadNativeBoardPacker();
    assert.equal(addon.scoreIslandQuality({corePairs:false, origin:{x:0,y:0}, bbox:{left:0,right:2,top:0,bottom:1}, overlap:false,
        points:[],pads:[],pairs:[],centerPowerBus:false}), 7);
    assert.equal(addon.scorePlacementOrientation({kind:'bypass',axis:'x',offsets:[{x:0,y:2},{x:0,y:-2}]}), Math.fround(.8));
    assert.equal(addon.scorePlacementOrientation({kind:'rowPower',axis:'x',side:1,power:{x:0,y:2},ret:{x:0,y:-2}}),4);
    assert.deepEqual(addon.placementLayerPenalties([[2,true],[2,false]]),[40,20]);
});

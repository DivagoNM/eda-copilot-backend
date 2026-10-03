import test from 'node:test';
import assert from 'node:assert/strict';
import { minimalProblem } from './helpers/native-board-problem.ts';
import { loadNativeBoardPacker } from '../src/pcb-layout/pcb-auto-place-v2/native/load-native-board-packer.ts';
import type { NativeBlockSolveProblemV4 } from '../src/pcb-layout/pcb-auto-place-v2/native/contract.ts';

function problem(net: string, distance = 4): NativeBlockSolveProblemV4 {
    const source = minimalProblem();
    const primitives = ['U1', 'R1'].map((ref, i) => {
        const p = structuredClone(source.primitives[0]);
        const x = i * distance;
        Object.assign(p, { id: ref, locked: true, canRotate: false, allowedOrientations: [0],
            bbox: { left: x - .5, right: x + .5, top: -.5, bottom: .5 }, width: 1, height: 1,
            placements: [{ designator: ref, x, y: 0, rotate: 0, layer: 'top', score: 0 }],
            connectionPoints: net ? [{ ref: `${ref}.1`, net, x, y: 0 }] : [] });
        p.collisionBoxes = [p.bbox];
        return p;
    });
    return { version: 4, grid: .5, clearance: .2, searchWidth: 1, compactness: 'normal',
        collisionMode: 'components', hardCollisionMode: 'components', candidateBoxMode: 'bbox',
        primitives, components: primitives.map((p, i) => ({ designator: p.id, primitiveId: p.id,
            blockName: 'test', layer: 'top', bodyBox: p.bbox, throughHoleBoxes: [], pinCount: 2,
            role: i ? 'passive' : 'main_ic', powerComponent: false })),
        componentPairClearance: [0, .2, .2, 0], componentConflict: [0, 1, 1, 0],
        relations: [], obstacles: [], experiments: { stableNetWeight: true, reducedHull: true } };
}
const score = (p: NativeBlockSolveProblemV4) => loadNativeBoardPacker().solveBlockPrimitives(p).rank.score;
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < .002, `${a} != ${b}`);

test('search prices power-net spread at one quarter of signal-net spread', () => {
    const empty = score(problem(''));
    close(score(problem('+3V3')) - empty, (score(problem('CAN_TX')) - empty) * .25);
});

test('connected IC-pad stretch matches checkpoint prices without the old pair penalty', () => {
    for (const [net, weight] of [['CAN_TX', 1], ['+3V3', .25]] as const) {
        for (const [distance, expected] of [[2, 12], [4, 56], [8, 848]]) {
            const p = problem(net, distance), baseline = score(p);
            p.experiments!.longNets = true;
            close(score(p) - baseline, weight * expected);
        }
    }
});

test('IC stretch uses the nearest same-net pin once and leaves GND unchanged', () => {
    const p = problem('CAN_TX');
    p.primitives[0].connectionPoints.push({ ref: 'U1.2', net: 'CAN_TX', x: 1, y: 0 });
    const baseline = score(p); p.experiments!.longNets = true;
    close(score(p) - baseline, 18);
    const gnd = problem('GND'), before = score(gnd); gnd.experiments!.longNets = true;
    close(score(gnd), before);
});

test('IC-to-IC links retain their existing long-pair penalty', () => {
    const p = problem('CAN_RX'); p.components[1].role = 'main_ic';
    const before = score(p); p.experiments!.longNets = true;
    close(score(p) - before, 78.4);
});

test('normal compactness retains the original native area and hull costs', () => {
    const p = problem(''); p.primitives = [p.primitives[0]];
    p.components = [p.components[0]]; p.componentConflict = [0]; p.componentPairClearance = [0];
    close(score(p), 3.2 + 2.5 * 2 + 2.5 + 1.5 * 4);
    p.primitives[0].bbox.right = 1.5; p.primitives[0].width = 2;
    p.primitives[0].collisionBoxes = [p.primitives[0].bbox]; p.components[0].bodyBox = p.primitives[0].bbox;
    close(score(p), 3.2 * 2 + 2.5 * 3 + 2.5 * 2 + 1.5 * 6);
});

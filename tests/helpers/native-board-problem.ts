import type { NativeBoardPackProblemV7 } from '../../src/pcb-layout/pcb-auto-place-v2/native/contract.ts';
import type { PlacementPrimitive } from '../../src/pcb-layout/pcb-auto-place-v2/primitives.ts';

export function minimalProblem(): NativeBoardPackProblemV7 {
    const primitive = minimalPrimitive();
    return {
        version: 7,
        grid: 0.5,
        clearance: 0.2,
        searchWidth: 32,
        compactness: 'normal',
        bounds: { left: -5, right: 5, top: -5, bottom: 5 },
        fullBoardBounds: { left: -5, right: 5, top: -5, bottom: 5 },
        boardOutline: [
            { x: -5, y: -5 },
            { x: 5, y: -5 },
            { x: 5, y: 5 },
            { x: -5, y: 5 },
        ],
        edgeClearance: 0.2,
        primitives: [{
            ...primitive,
            sourceNodeIds: [primitive.sourceNodeId],
            locked: false,
            canRotate: true,
            allowedOrientations: [0, 90, 180, 270],
            collisionBoxes: primitive.collisionBoxes ?? [],
            pathPorts: [],
            edgePlace: null,
        }],
        relations: [],
        obstacles: [],
        constraintRegions: [],
        components: [{
            designator: 'U1',
            primitiveId: primitive.id,
            blockName: 'core',
            layer: 'top',
            bodyBox: primitive.bbox,
            throughHoleBoxes: [],
            boardOverflow: { left: 0, right: 0, top: 0, bottom: 0 },
            edgeClearance: 0.2,
        }],
        componentPairClearance: [0],
        componentConflict: [0],
    };
}

export function minimalPrimitive(): PlacementPrimitive {
    return {
        id: 'primitive:core',
        kind: 'block',
        label: 'core',
        sourceNodeId: 'tree:block:core',
        locked: false,
        canRotate: true,
        allowedOrientations: [0, 90, 180, 270],
        bbox: { left: -1, right: 1, top: -0.5, bottom: 0.5 },
        collisionBoxes: [{ left: -1, right: 1, top: -0.5, bottom: 0.5 }],
        width: 2,
        height: 1,
        placements: [{ designator: 'U1', x: 0, y: 0, rotate: 0, layer: 'top', score: 0 }],
        connectionPoints: [{ ref: 'U1.1', net: 'SIG', x: 0.8, y: 0 }],
        children: [],
    };
}

/** Synthetic bus exercises unequal distances, multiple pads, power and the cap. */
export function addOrdinaryBus(problem: Pick<NativeBoardPackProblemV7, 'primitives' | 'relations'>) {
    for (let n = 0; n < 7; n++) {
        const net = `BUS${n}`;
        problem.relations.push({ id: `__ordinary_net__:${net}`, kind: 'net',
            from: `__ordinary_net__:${net}`, to: `__ordinary_net__:${net}`,
            weight: n === 6 ? .1 : 1, hard: false, effect: 'score_only', satelliteAnchor: false });
        problem.primitives.forEach((p, i) => {
            const pose = p.placements[0];
            p.connectionPoints.push({ ref: `${pose.designator}.bus${n}`, net,
                x: pose.x + (n % 2 ? i * 45 : -i * 17) + n, y: pose.y + n * .25 });
            if (n === 0) p.connectionPoints.push({ ref: `${pose.designator}.bus${n}extra`, net,
                x: pose.x + i * 30, y: pose.y + 2 });
        });
    }
}


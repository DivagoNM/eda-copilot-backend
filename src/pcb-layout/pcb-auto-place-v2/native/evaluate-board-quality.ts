import type { PlacementInput } from '#types/pcb/layout-model.ts';
import type { PlacementPrimitive } from '../primitives.ts';
import type { BoardPackParams } from '../board-packer.ts';
import type { BoardSoftAlignment } from '../board-alignment.ts';
import { createClearanceResolver } from '../../pcb-auto-place/clearance-resolver.ts';
import { boardSpacingExemptPairs, boardSpacingPolicy } from '../board-spacing.ts';
import { encodeNativeBoardPackProblem } from './encode-board-problem.ts';
import { loadNativeBoardPacker } from './load-native-board-packer.ts';
import { buildPlacementGraph } from '../../pcb-auto-place/placement-graph.ts';
import { ordinaryNetRelations } from '../board-solver.ts';

/** Encoding only. Production portfolio callers pass the actual packer context. */
export function evaluateBoardQuality(input: PlacementInput, primitives: PlacementPrimitive[],
    params?: BoardPackParams, alignment?: BoardSoftAlignment, gap?: number) {
    return loadNativeBoardPacker().evaluateBoardQuality(encodeBoardQualityProblem(input, primitives, params, alignment, gap));
}

export function encodeBoardQualityProblem(input: PlacementInput, primitives: PlacementPrimitive[],
    params?: BoardPackParams, alignment?: BoardSoftAlignment, gap?: number, spacingOnly = false) {
    const spacing = params?.options.softSpacing ?? (gap === undefined ? boardSpacingPolicy(input) : {gap, compactnessScale: 1});
    const graph = params || spacingOnly ? undefined : buildPlacementGraph(input);
    const node = params?.node ?? graph?.root ?? {id:'board',label:'board',kind:'board' as const,children:[]};
    const prepared = params || spacingOnly ? primitives : primitives.map(p => ({...p, connectionPoints: p.connectionPoints.map(cp => {
        const [designator, pin] = cp.ref.split('.');
        return {...cp, net: cp.net ?? input.components.find(c => c.designator === designator)?.pins.find(p => String(p.pin_number) === pin)?.signal_name};
    })}));
    const problem = encodeNativeBoardPackProblem({
        node, primitives: prepared,
        relations: params?.relations ?? (spacingOnly ? [] : [...graph!.relations.filter(r => r.scope === node.id), ...ordinaryNetRelations({input, node}, prepared)]),
        options: params?.options ?? {
            grid: input.solverOptions.placementGridStep ?? .5, clearance: input.board.clearances.component,
            componentByDesignator: new Map(input.components.map(c => [c.designator, c])),
            clearanceResolver: createClearanceResolver(input), board: input.board,
            bounds: { left: -input.board.outline.width / 2, right: input.board.outline.width / 2,
                top: -input.board.outline.height / 2, bottom: input.board.outline.height / 2 },
            ignoredNets: input.solverOptions.ignoredRatsnestSignals,
            edgeClearance: input.board.clearances.edge, constraintRegions: input.constraintRegions,
            softAlignment: alignment,
            softSpacing: { ...spacing, gap: gap ?? spacing.gap, exemptPairs: boardSpacingExemptPairs(input, primitives) },
        },
    });
    return problem;
}

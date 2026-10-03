import * as fp from '../f32.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PlacementInput } from '#types/pcb/layout-model.ts';
import { getPadWorld } from '../pcb-auto-place/geometry.ts';
import { createFixedPlacement } from '../pcb-auto-place/fixed.ts';
import { encodeNativeBlockSolveProblem } from './native/encode-block-problem.ts';
import type { BlockSolveParams } from './block-solver.ts';
import { blockPolicy } from './block-policy.ts';
import { encodeNativePostPlaceRefineProblem } from './native/encode-post-place-refine.ts';
import type { ClearanceResolver } from '../pcb-auto-place/clearance-resolver.ts';
import { loadNativeBoardPacker } from './native/load-native-board-packer.ts';
import { blockScopedInput, scopedPlacements } from './block-post-refiner.ts';
import type { PlacementPrimitive } from './primitives.ts';

export interface BlockQuality {
    score: number;
    electrical: number;
    localStretch: number;
    wire: number;
    maxLocal: number;
    area: number;
    width: number;
    height: number;
    exposure: number;
    links: Record<string, number>;
    ports: Record<string, { x: number; y: number }>;
}
export interface BlockCandidate {
    stage: string;
    hypothesis: string;
    primitives: PlacementPrimitive[];
    quality: BlockQuality;
}

const capture = new AsyncLocalStorage<(label: string, pool: BlockCandidate[], selected: BlockCandidate[]) => void>();
export function withBlockCandidateCapture<T>(callback: NonNullable<ReturnType<typeof capture.getStore>>, run: () => T): T {
    return capture.run(callback, run);
}
export function captureBlockCandidates(label: string, pool: BlockCandidate[], selected: BlockCandidate[]) {
    capture.getStore()?.(label, pool, selected);
}

export function legalBlockCandidate(input: PlacementInput, primitives: PlacementPrimitive[], clearance: ClearanceResolver, world = false) {
    if (world && primitives.flatMap(p=>p.placements).some(p=> {
        const c=input.components.find(c=>c.designator===p.designator)!;
        const fixed=createFixedPlacement(input,c);
        return fixed && (p.x!==fixed.x || p.y!==fixed.y || p.rotate!==fixed.rotate || p.layer!==fixed.layer);
    })) return false;
    const scoped = blockScopedInput(input, primitives, world);
    const placements = scopedPlacements(input, primitives, world);
    const problem = encodeNativePostPlaceRefineProblem(scoped, placements, 1);
    problem.pairClearances = scoped.components.map(a => scoped.components.map(b => clearance(a.designator, b.designator)));
    const scope = world ? primitives.flatMap(p=>p.placements).map(p=>p.designator)
        .filter(d=>!input.components.find(c=>c.designator===d)?.pcb.fixedPlacement) : undefined;
    return loadNativeBoardPacker().validatePlacement(problem, scope);
}

/** Rust search is authoritative. TS only encodes the candidate and its context. */
export function blockQuality(input: PlacementInput, primitives: PlacementPrimitive[], params?: BlockSolveParams): BlockQuality {
    const components = new Map(input.components.map(c => [c.designator, c]));
    // Populate points for callers that supply only placements (reports/tests).
    const prepared = primitives.map(p => p.connectionPoints.length ? p : { ...p, connectionPoints: p.placements.flatMap(pose => {
        const c = components.get(pose.designator)!;
        return c.pins.flatMap(pin => {
            const point = getPadWorld(c, pose, pin.pin_number);
            return point ? [{ ...point, ref: c.designator + '.' + pin.pin_number, net: pin.signal_name || undefined }] : [];
        });
    }) });
    const options = params?.options ?? {
        grid: input.solverOptions.placementGridStep ?? .5, clearance: input.board.clearances.component,
        componentByDesignator: components, experiments: blockPolicy(input.solverOptions.ignoredRatsnestSignals).experiments,
    };
    const problem = encodeNativeBlockSolveProblem({
        node: params?.node ?? { id: 'quality', label: 'quality', kind: 'block', children: [] },
        primitives: prepared, relations: params?.relations ?? [], options,
    });
    return loadNativeBoardPacker().evaluateBlockQuality(problem);
}

export function comparableBlockQuality(candidate: BlockQuality, best: BlockQuality) {
    return loadNativeBoardPacker().compareBlockQuality(candidate, best, 'comparable');
}

function signature(primitives: PlacementPrimitive[]) {
    const ps = primitives.flatMap(p => p.placements).sort((a, b) => a.designator.localeCompare(b.designator));
    const origin = ps[0];
    return JSON.stringify(ps.map(p => [p.designator, Math.round(fp.mul((fp.sub(p.x, origin.x)), 1000)),
        Math.round(fp.mul((fp.sub(p.y, origin.y)), 1000)), p.rotate, p.layer]));
}

/** Quality gate first, then retain useful geometry/port diversity; never pad to three. */
export function selectBlockCandidates(candidates: BlockCandidate[]): BlockCandidate[] {
    const seen = new Set<string>();
    const ranked = candidates.filter(c => Number.isFinite(c.quality.score)).sort((a, b) => fp.sub(a.quality.score, b.quality.score))
        .filter(c => { const key = signature(c.primitives); if (seen.has(key)) return false; seen.add(key); return true; });
    if (!ranked.length) return [];
    const best = ranked[0];
    const comparable = ranked.filter(c => comparableBlockQuality(c.quality, best.quality));
    const selected = [best];
    for (const c of comparable.slice(1)) {
        // A lower-quality candidate needs a useful improvement in shape or access.
        const q = c.quality;
        if (selected.some(s => loadNativeBoardPacker().compareBlockQuality(s.quality, q, 'dominates'))) continue;
        selected.push(c);
        if (selected.length === 3) break;
    }
    return selected;
}

import { loadNativeBoardPacker } from './native/load-native-board-packer.ts';
import * as fp from '../f32.ts';
import type {
    Box,
    Layer,
    PcbComponent,
    Placement,
    PlacementGraph,
    PlacementInput,
    PlacementTreeNode,
    Point,
} from '#types/pcb/layout-model.ts';
import {
    componentBox,
    componentPadBox,
    componentPairCollisionBoxPairs,
    getPadOffset,
    isThroughHolePad,
    overlaps,
    roundPlacement,
    rotatedSize,
    unionBoxes,
} from '../pcb-auto-place/geometry.ts';
import type { ClearanceResolver } from '../pcb-auto-place/clearance-resolver.ts';
import { createClearanceResolver } from '../pcb-auto-place/clearance-resolver.ts';
import { placementsCanConflict } from '../pcb-auto-place/utils.ts';

type IslandKind = 'line' | 'bypass' | 'cap_cluster' | 'core_pairs';

export interface IslandSolverOptions {
    grid?: number;
    clearance?: number;
}

export interface IslandSolveDiagnostic {
    severity: 'warning' | 'error';
    message: string;
}

export interface IslandSolveResult {
    islandId: string;
    label: string;
    kind: IslandKind;
    scope: string;
    placements: Placement[];
    bbox: Box;
    width: number;
    height: number;
    area: number;
    score: number;
    diagnostics: IslandSolveDiagnostic[];
}

type CandidatePlacement = Placement & { box: Box; component: PcbComponent };

type IslandNode = PlacementTreeNode & {
    kind: 'island';
    data: Record<string, unknown> & {
        kind: IslandKind;
        components?: string[];
    };
};

export function solvePlacementIslands(
    input: PlacementInput,
    graph: PlacementGraph,
    options: IslandSolverOptions = {},
): IslandSolveResult[] {
    const componentByDesignator = new Map(input.components.map((component) => [component.designator, component]));
    const grid = options.grid ?? input.solverOptions.placementGridStep ?? 0.5;
    const clearance = options.clearance ?? input.board.clearances.component ?? 0.8;
    const clearanceResolver = createClearanceResolver(input);
    return collectIslandNodes(graph.root)
        .map((island) => solveIsland(island, input, componentByDesignator, grid, clearance, clearanceResolver))
        .filter((result): result is IslandSolveResult => Boolean(result));
}

function solveIsland(
    island: IslandNode,
    input: PlacementInput,
    componentByDesignator: Map<string, PcbComponent>,
    grid: number,
    clearance: number,
    clearanceResolver: ClearanceResolver,
): IslandSolveResult | null {
    const components = island.data.components
        ?.map((designator) => componentByDesignator.get(designator))
        .filter((component): component is PcbComponent => Boolean(component)) ?? [];
    if (components.length === 0) return null;

    const diagnostics: IslandSolveDiagnostic[] = [];
    const kind = island.data.kind;
    const placements = kind === 'cap_cluster'
        ? solveCapCluster(island, components, input, grid, clearance, clearanceResolver)
        : kind === 'core_pairs' && components.length === 2
            ? solveTwoComponentCorePairs(island, components, grid, clearance, clearanceResolver)
        : kind === 'bypass'
            ? solveBypass(island, input, components, grid, clearance, clearanceResolver)
        : kind === 'line'
            ? solveOrderedIsland(island, input, components, grid, clearance, clearanceResolver)
            : solveCompactIsland(island, components, grid, clearance, clearanceResolver);

    const bbox = placementsBox(components, placements);
    const score = scorePlacements(island, components, placements, clearanceResolver);
    if (hasOverlap(components, placements, clearanceResolver)) {
        diagnostics.push({ severity: 'error', message: 'Island placements overlap after compact solve' });
    }

    return {
        islandId: island.id,
        label: island.label,
        kind,
        scope: island.ref ?? island.id,
        placements: placements.map(({ designator, x, y, rotate, layer, score }) => ({ designator, x, y, rotate, layer, score })),
        bbox,
        width: roundPlacement(fp.sub(bbox.right, bbox.left)),
        height: roundPlacement(fp.sub(bbox.bottom, bbox.top)),
        area: roundPlacement(fp.mul((fp.sub(bbox.right, bbox.left)), (fp.sub(bbox.bottom, bbox.top)))),
        score: roundPlacement(score),
        diagnostics,
    };
}

function solveCapCluster(island: IslandNode, components: PcbComponent[], input: PlacementInput, grid: number, clearance: number, clearanceResolver: ClearanceResolver): CandidatePlacement[] {
    const axis = island.data.axis === 'x' || island.data.axis === 'y' ? island.data.axis : null;
    const maxRows = island.data.maxRows === 1 || island.data.maxRows === 2 ? island.data.maxRows : 2;
    const topology = island.data.topology === 'center_power_bus' ? 'center_power_bus' : 'edge_bus';
    const gap = typeof island.data.gap === 'number' ? fp.max(island.data.gap, clearance) : clearance;
    const rowGap = typeof island.data.rowGap === 'number' ? fp.max(island.data.rowGap, clearance) : gap;
    const axes: Array<'x' | 'y'> = axis ? [axis] : ['x', 'y'];
    const rotations = normalizedRotations(components[0]);
    const variants: CandidatePlacement[][] = [];

    for (const candidateAxis of axes) {
        const powerSide = targetPinPowerSide(island, input, candidateAxis);
        for (let rows = 1; rows <= maxRows; rows += 1) {
            const maxPerRow = typeof island.data.maxPerRow === 'number'
                ? Math.max(1, Math.floor(island.data.maxPerRow))
                : Math.ceil(fp.div(components.length, rows));
            const actualRows = Math.ceil(fp.div(components.length, maxPerRow));
            if (actualRows > maxRows) continue;
            if (topology === 'center_power_bus' && rows === 1 && maxRows >= 2 && Math.ceil(fp.div(components.length, maxPerRow)) >= 2) {
                // a two-row center_power_bus variant will be generated at rows === 2
                continue;
            }
            if (topology === 'center_power_bus' && rows === 2 && actualRows === 2) {
                variants.push(placeCenterPowerBus(components, candidateAxis, maxPerRow, grid, gap, rowGap, island, powerSide));
            } else if (actualRows === 1) {
                variants.push(placeRowWithPowerSide(components, candidateAxis, powerSide, gap, grid, island));
            } else {
                for (const rotate of rotationsForAxis(rotations, components, island, candidateAxis)) {
                    variants.push(placeGrid(components, candidateAxis, maxPerRow, rotate, grid, clearance, gap, rowGap));
                }
            }
        }
    }

    return bestVariant(island, components, variants, clearance, clearanceResolver);
}

function solveOrderedIsland(island: IslandNode, input: PlacementInput, components: PcbComponent[], grid: number, clearance: number, clearanceResolver: ClearanceResolver): CandidatePlacement[] {
    const axis = island.data.axis === 'x' || island.data.axis === 'y' ? island.data.axis : chooseCompactAxis(components);
    const rotate = bestLineRotation(components, axis, island, input, clearance, clearanceResolver);
    return placeGrid(components, axis, components.length, rotate, grid, clearance);
}

function solveBypass(island: IslandNode, input: PlacementInput, components: PcbComponent[], grid: number, clearance: number, _clearanceResolver: ClearanceResolver): CandidatePlacement[] {
    if (components.length === 0) return [];
    const promoted = promotedBypassClusterData(island, input, components);
    if (promoted) {
        return solveCapCluster({ ...island, data: { ...island.data, ...promoted } }, components, input, grid, clearance, _clearanceResolver);
    }
    const axis = island.data.axis === 'x' || island.data.axis === 'y' ? island.data.axis : chooseCompactAxis(components);
    const gap = typeof island.data.gap === 'number' ? fp.max(island.data.gap, clearance) : clearance;
    const targetNet = resolveTargetNet(island, input);
    const explicitRotate = typeof island.data.rotate === 'number' ? normalizeRotation(island.data.rotate) : null;
    const rotate = explicitRotate ?? (targetNet ? bestBypassRotation(components, axis, targetNet) : bestLineRotation(components, axis, island, input, clearance, _clearanceResolver));
    return placeGrid(components, axis, components.length, rotate, grid, clearance, gap);
}

function promotedBypassClusterData(island: IslandNode, input: PlacementInput, components: PcbComponent[]) {
    if (island.data.kind !== 'bypass' || components.length < 5) return null;
    const powerNet = resolveTargetNet(island, input);
    if (!powerNet) return null;
    const returnNet = commonBypassReturnNet(components, powerNet);
    if (!returnNet) return null;
    return {
        kind: 'cap_cluster' as const,
        powerNet,
        returnNet,
        maxRows: 2,
        maxPerRow: Math.ceil(fp.div(components.length, 2)),
        topology: 'center_power_bus',
        axis: island.data.axis === 'x' || island.data.axis === 'y' ? island.data.axis : null,
        rowGap: typeof island.data.rowGap === 'number' ? island.data.rowGap : island.data.gap,
    };
}

function commonBypassReturnNet(components: PcbComponent[], powerNet: string) {
    const counts = new Map<string, number>();
    for (const component of components) {
        const nets = new Set(component.pins
            .map((pin) => pin.signal_name)
            .filter((net): net is string => Boolean(net) && net !== powerNet));
        for (const net of nets) counts.set(net, fp.add((counts.get(net) ?? 0), 1));
    }
    return [...counts.entries()]
        .filter(([, count]) => count >= Math.max(2, Math.floor(fp.mul(components.length, 0.5))))
        .sort((a, b) => fp.sub(b[1], a[1]) || fp.sub(Number(isGroundNet(b[0])), Number(isGroundNet(a[0]))) || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

function bestBypassRotation(components: PcbComponent[], axis: 'x' | 'y', targetNet: string): number {
    const rotations = normalizedRotations(components[0]);
    const scored = rotations.map((rotate) => {
        const offsets = components.flatMap(component => {
            const pin = component.pins.find(item => item.signal_name === targetNet);
            const offset = pin && getPadOffset(component, pin.pin_number, rotate);
            return offset ? [offset] : [];
        });
        return {rotate, score:loadNativeBoardPacker().scorePlacementOrientation({kind:'bypass', offsets, axis})};
    });
    scored.sort((a, b) => fp.sub(b.score, a.score));
    return scored[0]?.rotate ?? 0;
}

function solveCompactIsland(island: IslandNode, components: PcbComponent[], grid: number, clearance: number, clearanceResolver: ClearanceResolver): CandidatePlacement[] {
    const ordered = components
        .slice()
        .sort((a, b) => fp.sub(pairDegree(island, b.designator), pairDegree(island, a.designator)) || fp.sub(footprintArea(b), footprintArea(a)));
    const placed: CandidatePlacement[] = [];

    for (const component of ordered) {
        const candidates = compactCandidates(component, placed, grid, clearance);
        let best = candidates[0];
        let bestScore = Infinity;
        for (const candidate of candidates) {
            const variant = [...placed, candidate];
            if (hasOverlap(ordered, variant, clearanceResolver)) continue;
            const score = scorePlacements(island, ordered, variant, clearanceResolver);
            if (score < bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
        placed.push(best);
    }

    return centerPlacements(placed, grid);
}

function solveTwoComponentCorePairs(island: IslandNode, components: PcbComponent[], grid: number, clearance: number, clearanceResolver: ClearanceResolver): CandidatePlacement[] {
    const anchor = selectCoreAnchor(island, components);
    const moving = components.find((component) => component.designator !== anchor.designator) ?? components[1];
    const variants: CandidatePlacement[][] = [];

    for (const anchorRotate of coreAnchorRotations(anchor)) {
        const anchorPlacement = candidatePlacement(anchor, 0, 0, anchorRotate);
        for (const movingRotate of normalizedRotations(moving)) {
            const pairClearance = fp.add(fp.max(clearance, clearanceResolver(anchor.designator, moving.designator)), .001);
            const centers = movingCentersAround(anchorPlacement.box, rotatedSize(moving.footprint, movingRotate), grid, pairClearance);
            // Add exact pad alignments and the midpoint balancing both links;
            // bbox/grid offsets alone miss these tangential positions.
            const movingOrigin = candidatePlacement(moving, 0, 0, movingRotate);
            const alignments = parseIslandPairs(island).flatMap(([a, b]) => {
                const [fixedRef, movingRef] = a.startsWith(`${anchor.designator}.`) ? [a, b] : [b, a];
                const fixedPad = padWorld(components, [anchorPlacement, movingOrigin], fixedRef);
                const movingPad = padWorld(components, [anchorPlacement, movingOrigin], movingRef);
                return fixedPad && movingPad ? [{ x: fp.sub(fixedPad.x, movingPad.x), y: fp.sub(fixedPad.y, movingPad.y) }] : [];
            });
            if (alignments.length > 1) alignments.push({ x: fp.div(alignments.reduce((n,p)=>fp.add(n, p.x),0), alignments.length), y: fp.div(alignments.reduce((n,p)=>fp.add(n, p.y),0), alignments.length) });
            const size = rotatedSize(moving.footprint, movingRotate), box = anchorPlacement.box;
            for (const p of alignments) centers.push(
                { x: fp.sub(fp.sub(box.left, pairClearance), fp.div(size.width, 2)), y: p.y },
                { x: fp.add(fp.add(box.right, pairClearance), fp.div(size.width, 2)), y: p.y },
                { x: p.x, y: fp.sub(fp.sub(box.top, pairClearance), fp.div(size.height, 2)) },
                { x: p.x, y: fp.add(fp.add(box.bottom, pairClearance), fp.div(size.height, 2)) },
            );
            for (const center of dedupePoints(centers)) {
                variants.push([
                    anchorPlacement,
                    candidatePlacement(moving, center.x, center.y, movingRotate),
                ]);
            }
        }
    }

    return centerPlacements(bestCorePairVariant(island, components, variants, clearanceResolver), grid);
}

function coreAnchorRotations(anchor: PcbComponent) {
    const rotations = normalizedRotations(anchor);
    if (anchor.pcb.role !== 'main_ic') return rotations;
    const scored = rotations.map((rotate) => ({ rotate, score: pinOneUpperLeftRotationPenalty(anchor, rotate) }));
    const best = fp.min(...scored.map((item) => item.score));
    return scored
        .filter((item) => item.score <= fp.add(best, 0.001))
        .map((item) => item.rotate);
}

function selectCoreAnchor(island: IslandNode, components: PcbComponent[]) {
    return components.slice().sort((a, b) =>
        fp.sub(Number(b.pcb.role === 'main_ic'), Number(a.pcb.role === 'main_ic'))
        || fp.sub(pairDegree(island, b.designator), pairDegree(island, a.designator))
        || b.footprint.pads.length - a.footprint.pads.length
        || fp.sub(footprintArea(b), footprintArea(a)))[0];
}

function movingCentersAround(anchorBox: Box, movingSize: { width: number; height: number }, _grid: number, clearance: number) {
    const anchorCenter = {
        x: fp.div((fp.add(anchorBox.left, anchorBox.right)), 2),
        y: fp.div((fp.add(anchorBox.top, anchorBox.bottom)), 2),
    };
    const offsets = uniqueNumbers([
        0,
        clearance,
        -clearance,
        fp.mul(clearance, 2),
        fp.mul(-clearance, 2),
        fp.div(movingSize.width, 2),
        fp.div(-movingSize.width, 2),
        fp.div(movingSize.height, 2),
        fp.div(-movingSize.height, 2),
    ]);
    const baseCenters = [
        { x: fp.sub(fp.sub(anchorBox.left, clearance), fp.div(movingSize.width, 2)), y: anchorCenter.y, axis: 'y' as const },
        { x: fp.add(fp.add(anchorBox.right, clearance), fp.div(movingSize.width, 2)), y: anchorCenter.y, axis: 'y' as const },
        { x: anchorCenter.x, y: fp.sub(fp.sub(anchorBox.top, clearance), fp.div(movingSize.height, 2)), axis: 'x' as const },
        { x: anchorCenter.x, y: fp.add(fp.add(anchorBox.bottom, clearance), fp.div(movingSize.height, 2)), axis: 'x' as const },
    ];
    const centers: Point[] = [];
    for (const base of baseCenters) {
        for (const offset of offsets) {
            centers.push({
                x: roundPlacement(fp.add(base.x, (base.axis === 'x' ? offset : 0))),
                y: roundPlacement(fp.add(base.y, (base.axis === 'y' ? offset : 0))),
            });
        }
    }
    return dedupePoints(centers);
}

function bestCorePairVariant(island: IslandNode, components: PcbComponent[], variants: CandidatePlacement[][], clearanceResolver: ClearanceResolver) {
    return variants
        .filter((variant) => !hasOverlap(components, variant, clearanceResolver))
        .sort((a, b) => fp.sub(scoreCorePairVariant(island, components, a, clearanceResolver), scoreCorePairVariant(island, components, b, clearanceResolver)))[0]
        ?? variants.sort((a, b) => fp.sub(scoreCorePairVariant(island, components, a, clearanceResolver), scoreCorePairVariant(island, components, b, clearanceResolver)))[0]
        ?? [];
}

function scoreCorePairVariant(island: IslandNode, components: PcbComponent[], placements: CandidatePlacement[], clearanceResolver: ClearanceResolver) {
    return nativeIslandScore(island, components, placements, clearanceResolver, true);
}

function pinOneUpperLeftRotationPenalty(component: PcbComponent, rotate: number) {
    const offset = getPadOffset(component, '1', rotate, component.pcb.allowedLayers[0] ?? 'top');
    return offset ? loadNativeBoardPacker().scorePlacementOrientation({ kind: 'pinOne', offset, ...rotatedSize(component.footprint, rotate) }) : 0;
}

function compactCandidates(component: PcbComponent, placed: CandidatePlacement[], grid: number, clearance: number) {
    const candidates: CandidatePlacement[] = [];
    const rotations = normalizedRotations(component);
    if (placed.length === 0) {
        for (const rotate of rotations) candidates.push(candidatePlacement(component, 0, 0, rotate));
        return candidates;
    }

    const bbox = unionBoxes(placed.map((placement) => placement.box));
    for (const rotate of rotations) {
        const size = rotatedSize(component.footprint, rotate);
        const offsets = [
            { x: fp.add(fp.add(bbox.right, clearance), fp.div(size.width, 2)), y: 0 },
            { x: fp.sub(fp.sub(bbox.left, clearance), fp.div(size.width, 2)), y: 0 },
            { x: 0, y: fp.add(fp.add(bbox.bottom, clearance), fp.div(size.height, 2)) },
            { x: 0, y: fp.sub(fp.sub(bbox.top, clearance), fp.div(size.height, 2)) },
            { x: fp.add(fp.add(bbox.right, clearance), fp.div(size.width, 2)), y: fp.add(fp.add(bbox.bottom, clearance), fp.div(size.height, 2)) },
            { x: fp.add(fp.add(bbox.right, clearance), fp.div(size.width, 2)), y: fp.sub(fp.sub(bbox.top, clearance), fp.div(size.height, 2)) },
            { x: fp.sub(fp.sub(bbox.left, clearance), fp.div(size.width, 2)), y: fp.add(fp.add(bbox.bottom, clearance), fp.div(size.height, 2)) },
            { x: fp.sub(fp.sub(bbox.left, clearance), fp.div(size.width, 2)), y: fp.sub(fp.sub(bbox.top, clearance), fp.div(size.height, 2)) },
        ];
        for (const point of offsets) candidates.push(candidatePlacement(component, snap(point.x, grid), snap(point.y, grid), rotate));
    }
    return candidates;
}

function placeGrid(
    components: PcbComponent[],
    axis: 'x' | 'y',
    maxPerRow: number,
    rotate: number,
    grid: number,
    clearance: number,
    gap?: number,
    rowGap?: number,
): CandidatePlacement[] {
    const componentGap = fp.max(gap ?? clearance, clearance);
    const rowSpacing = fp.max(rowGap ?? gap ?? clearance, clearance);
    const sizes = components.map((component) => rotatedSize(component.footprint, rotate));
    const rowCount = Math.ceil(fp.div(components.length, maxPerRow));
    const rowSizes: Array<{ width: number; height: number }> = [];
    for (let row = 0; row < rowCount; row += 1) {
        const rowComponents = components.slice(fp.mul(row, maxPerRow), fp.mul((row + 1), maxPerRow));
        const rowComponentSizes = sizes.slice(fp.mul(row, maxPerRow), fp.mul((row + 1), maxPerRow));
        const width = axis === 'x'
            ? fp.add(rowComponentSizes.reduce((sum, size) => fp.add(sum, size.width), 0), fp.mul(componentGap, Math.max(0, rowComponents.length - 1)))
            : fp.max(...rowComponentSizes.map((size) => size.width));
        const height = axis === 'x'
            ? fp.max(...rowComponentSizes.map((size) => size.height))
            : fp.add(rowComponentSizes.reduce((sum, size) => fp.add(sum, size.height), 0), fp.mul(componentGap, Math.max(0, rowComponents.length - 1)));
        rowSizes.push({ width, height });
    }

    const placements: CandidatePlacement[] = [];
    let crossCursor = fp.sub(fp.div(-rowSizes.reduce((sum, size) => fp.add(sum, (axis === 'x' ? size.height : size.width)), 0), 2), fp.div(fp.mul(rowSpacing, Math.max(0, rowCount - 1)), 2));
    for (let row = 0; row < rowCount; row += 1) {
        const start = fp.mul(row, maxPerRow);
        const end = fp.min(components.length, fp.add(start, maxPerRow));
        const rowSize = rowSizes[row];
        let mainCursor = fp.div(-(axis === 'x' ? rowSize.width : rowSize.height), 2);
        const crossCenter = fp.add(crossCursor, fp.div((axis === 'x' ? rowSize.height : rowSize.width), 2));
        for (let index = start; index < end; index += 1) {
            const component = components[index];
            const size = sizes[index];
            const mainCenter = fp.add(mainCursor, fp.div((axis === 'x' ? size.width : size.height), 2));
            const x = axis === 'x' ? mainCenter : crossCenter;
            const y = axis === 'x' ? crossCenter : mainCenter;
            placements.push(candidatePlacement(component, roundPlacement(x), roundPlacement(y), rotate));
            mainCursor = fp.add(mainCursor, fp.add((axis === 'x' ? size.width : size.height), componentGap));
        }
        crossCursor = fp.add(crossCursor, fp.add((axis === 'x' ? rowSize.height : rowSize.width), rowSpacing));
    }
    return centerPlacements(placements, grid);
}

function targetPinPowerSide(island: IslandNode, input: PlacementInput, axis: 'x' | 'y'): 1 | -1 {
    const target = island.data.target;
    if (!target || typeof target !== 'object' || (target as { type?: string }).type !== 'pin') return 1;
    const pinTarget = target as { type: 'pin'; designator: string; pin_number: string | number };
    const component = input.components.find((item) => item.designator === pinTarget.designator);
    if (!component) return 1;
    const pin = component.pins.find((item) => String(item.pin_number) === String(pinTarget.pin_number));
    if (!pin) return 1;
    const pad = component.footprint.pads.find((item) => String(item.pin_number) === String(pin.pin_number));
    if (!pad) return 1;
    return axis === 'x' ? (pad.y >= 0 ? 1 : -1) : (pad.x >= 0 ? 1 : -1);
}

function placeCenterPowerBus(
    components: PcbComponent[],
    axis: 'x' | 'y',
    maxPerRow: number,
    grid: number,
    gap: number,
    rowGap: number,
    island: IslandNode,
    powerSide: 1 | -1,
): CandidatePlacement[] {
    const rowCount = Math.ceil(fp.div(components.length, maxPerRow));
    if (rowCount < 2) {
        return placeRowWithPowerSide(components, axis, powerSide, gap, grid, island);
    }

    const rows: CandidatePlacement[][] = [];
    for (let row = 0; row < rowCount; row += 1) {
        const start = fp.mul(row, maxPerRow);
        const rowComponents = components.slice(start, fp.add(start, maxPerRow));
        const desiredSide = row === 0 ? powerSide : (-powerSide as 1 | -1);
        rows.push(placeRowWithPowerSide(rowComponents, axis, desiredSide, gap, grid, island));
    }

    const rowCrossSizes = rows.map((rowPlacements) => {
        const box = unionBoxes(rowPlacements.map((placement) => placement.box));
        return axis === 'x' ? fp.sub(box.bottom, box.top) : fp.sub(box.right, box.left);
    });
    const totalCross = fp.add(rowCrossSizes.reduce((sum, size) => fp.add(sum, size), 0), fp.mul(rowGap, (rows.length - 1)));
    let crossCursor = fp.div(-totalCross, 2);

    const result: CandidatePlacement[] = [];
    for (let row = 0; row < rows.length; row += 1) {
        const rowBox = unionBoxes(rows[row].map((placement) => placement.box));
        const rowCrossCenter = fp.add(crossCursor, fp.div(rowCrossSizes[row], 2));
        const dx = axis === 'x' ? fp.div(-(fp.add(rowBox.left, rowBox.right)), 2) : rowCrossCenter;
        const dy = axis === 'x' ? rowCrossCenter : fp.div(-(fp.add(rowBox.top, rowBox.bottom)), 2);
        for (const placement of rows[row]) {
            result.push(candidatePlacement(placement.component, roundPlacement(fp.add(placement.x, dx)), roundPlacement(fp.add(placement.y, dy)), placement.rotate));
        }
        crossCursor = fp.add(crossCursor, fp.add(rowCrossSizes[row], rowGap));
    }
    return result;
}

function placeRowWithPowerSide(
    components: PcbComponent[],
    axis: 'x' | 'y',
    desiredSide: 1 | -1,
    gap: number,
    grid: number,
    island: IslandNode,
): CandidatePlacement[] {
    const placements: CandidatePlacement[] = [];
    const sizes: Array<{ width: number; height: number }> = [];
    for (const component of components) {
        const rotations = normalizedRotations(component);
        const { powerPin, returnPin } = powerReturnPins(component, island);
        let bestRotate = rotations[0] ?? 0;
        let bestScore = -Infinity;
        for (const rotate of rotations) {
            const powerOffset = powerPin ? getPadOffset(component, powerPin.pin_number, rotate) : null;
            const returnOffset = returnPin ? getPadOffset(component, returnPin.pin_number, rotate) : null;
            if (!powerOffset || !returnOffset) continue;
            const score = loadNativeBoardPacker().scorePlacementOrientation({kind:'rowPower', power:powerOffset, ret:returnOffset, axis, side:desiredSide});
            if (score > bestScore) {
                bestScore = score;
                bestRotate = rotate;
            }
        }
        sizes.push(rotatedSize(component.footprint, bestRotate));
        placements.push(candidatePlacement(component, 0, 0, bestRotate));
    }

    const mainSize = fp.add(sizes.reduce((sum, size) => fp.add(sum, (axis === 'x' ? size.width : size.height)), 0), fp.mul(gap, Math.max(0, sizes.length - 1)));
    let mainCursor = fp.div(-mainSize, 2);
    const result: CandidatePlacement[] = [];
    for (let index = 0; index < components.length; index += 1) {
        const size = sizes[index];
        const mainCenter = fp.add(mainCursor, fp.div((axis === 'x' ? size.width : size.height), 2));
        const x = axis === 'x' ? mainCenter : 0;
        const y = axis === 'x' ? 0 : mainCenter;
        result.push(candidatePlacement(components[index], roundPlacement(x), roundPlacement(y), placements[index].rotate));
        mainCursor = fp.add(mainCursor, fp.add((axis === 'x' ? size.width : size.height), gap));
    }
    return centerPlacements(result, grid);
}

function powerReturnPins(component: PcbComponent, island: IslandNode) {
    const powerNet = typeof island.data.powerNet === 'string' ? island.data.powerNet : null;
    const returnNet = typeof island.data.returnNet === 'string' ? island.data.returnNet : null;
    const powerPin = powerNet ? component.pins.find((pin) => pin.signal_name === powerNet) ?? null : null;
    const returnPin = returnNet ? component.pins.find((pin) => pin.signal_name === returnNet) ?? null : null;
    return { powerPin, returnPin };
}

function bestVariant(island: IslandNode, components: PcbComponent[], variants: CandidatePlacement[][], clearance: number, clearanceResolver: ClearanceResolver) {
    return variants.reduce((best, variant) =>
        scorePlacements(island, components, variant, clearanceResolver) < scorePlacements(island, components, best, clearanceResolver)
            ? variant
            : best,
    variants[0] ?? []);
}

function scorePlacements(island: IslandNode, components: PcbComponent[], placements: CandidatePlacement[], clearanceResolver: ClearanceResolver) {
    return placements.length ? nativeIslandScore(island, components, placements, clearanceResolver, false) : Infinity;
}

function isGroundNet(net: string) { return net.toUpperCase().includes('GND'); }

function nativeIslandScore(island: IslandNode, components: PcbComponent[], placements: CandidatePlacement[], clearanceResolver: ClearanceResolver, corePairs: boolean) {
    const points = components.flatMap(c => {
        const pose = placements.find(p => p.designator === c.designator);
        return pose ? c.pins.flatMap(pin => {
            const point = padPoint(c, pose, pin.pin_number);
            return point ? [{ reference: c.designator + '.' + pin.pin_number, owner: c.designator,
                net: pin.signal_name, point, center: { x: pose.x, y: pose.y }, layer: pose.layer }] : [];
        }) : [];
    });
    const pads = corePairs ? components.flatMap(c => {
        const pose = placements.find(p => p.designator === c.designator)!;
        return c.footprint.pads.map(pad => ({ reference: c.designator + '.' + pad.pin_number,
            net: padNet(c, pad.pin_number), box: componentPadBox(pose, pad), layer: pose.layer, throughHole: isThroughHolePad(pad) }));
    }) : [];
    const anchor = corePairs ? selectCoreAnchor(island, components) : undefined;
    const pose = anchor && placements.find(p => p.designator === anchor.designator);
    const offset = anchor && pose && getPadOffset(anchor, '1', pose.rotate, pose.layer);
    return loadNativeBoardPacker().scoreIslandQuality({
        corePairs, origin:{x:0,y:0}, bbox: placementsBox(components, placements), overlap: hasOverlap(components, placements, clearanceResolver),
        points, pads, pairs: parseIslandPairs(island),
        maxDistance: typeof island.data.maxDistance === 'number' ? island.data.maxDistance : undefined,
        powerNet: island.data.kind === 'cap_cluster' && typeof island.data.powerNet === 'string' ? island.data.powerNet : undefined,
        returnNet: island.data.kind === 'cap_cluster' && typeof island.data.returnNet === 'string' ? island.data.returnNet : undefined,
        centerPowerBus: island.data.topology === 'center_power_bus',
        axis: island.data.axis === 'x' || island.data.axis === 'y' ? island.data.axis : undefined,
        pinOne: offset && anchor && pose ? { offset, ...rotatedSize(anchor.footprint, pose.rotate) } : undefined,
    });
}

function rotationsForAxis(rotations: number[], components: PcbComponent[], island: IslandNode, axis: 'x' | 'y') {
    const powerNet = typeof island.data.powerNet === 'string' ? island.data.powerNet : null;
    const returnNet = typeof island.data.returnNet === 'string' ? island.data.returnNet : null;
    if (!powerNet || !returnNet) return rotations;
    const scored = rotations.map((rotate) => ({
        rotate,
        score: loadNativeBoardPacker().placementScoreSum(components.map(component => padVectorAxisScore(component, powerNet, returnNet, rotate, axis))),
    }));
    const bestScore = fp.min(...scored.map((item) => item.score));
    return scored.filter((item) => item.score <= fp.add(bestScore, 0.001)).map((item) => item.rotate);
}

function padVectorAxisScore(component: PcbComponent, powerNet: string, returnNet: string, rotate: number, axis: 'x' | 'y') {
    const powerPin = component.pins.find((pin) => pin.signal_name === powerNet);
    const returnPin = component.pins.find((pin) => pin.signal_name === returnNet);
    if (!powerPin || !returnPin) return 0;
    const power = getPadOffset(component, powerPin.pin_number, rotate);
    const ret = getPadOffset(component, returnPin.pin_number, rotate);
    if (!power || !ret) return 0;
    return loadNativeBoardPacker().scorePlacementOrientation({kind:'padAxis', power, ret, axis});
}

function bestLineRotation(components: PcbComponent[], axis: 'x' | 'y', island: IslandNode, input: PlacementInput, clearance: number, clearanceResolver: ClearanceResolver) {
    const targetNet = resolveTargetNet(island, input);
    const rotations = normalizedRotations(components[0]);
    if (targetNet) {
        const scored = rotations.map((rotate) => ({
            rotate,
            topology: targetPadPerpendicularScore(components, axis, rotate, targetNet),
            compact: scorePlacements(island, components, placeGrid(components, axis, components.length, rotate, 0.5, clearance), clearanceResolver),
        }));
        scored.sort((a, b) => {
            if (b.topology !== a.topology) return fp.sub(b.topology, a.topology);
            return fp.sub(a.compact, b.compact);
        });
        return scored[0]?.rotate ?? 0;
    }
    return bestSharedRotation(components, axis, island, clearanceResolver);
}

function bestSharedRotation(components: PcbComponent[], axis: 'x' | 'y', island: IslandNode, clearanceResolver: ClearanceResolver) {
    const rotations = normalizedRotations(components[0]);
    return rotations
        .map((rotate) => ({
            rotate,
            score: scorePlacements(island, components, placeGrid(components, axis, components.length, rotate, 0.5, 0.8), clearanceResolver),
        }))
        .sort((a, b) => fp.sub(a.score, b.score))[0]?.rotate ?? 0;
}

function resolveTargetNet(island: IslandNode, input: PlacementInput): string | null {
    const target = island.data.target;
    if (!target || typeof target !== 'object' || (target as { type?: string }).type !== 'pin') return null;
    const pinTarget = target as { type: 'pin'; designator: string; pin_number: string | number };
    const component = input.components.find((item) => item.designator === pinTarget.designator);
    if (!component) return null;
    const pin = component.pins.find((item) => String(item.pin_number) === String(pinTarget.pin_number));
    return pin?.signal_name ?? null;
}

function padNet(component: PcbComponent, pinNumber: string | number): string | null {
    const pin = component.pins.find((item) => String(item.pin_number) === String(pinNumber));
    return pin?.signal_name ?? null;
}

function targetPadPerpendicularScore(components: PcbComponent[], axis: 'x' | 'y', rotate: number, targetNet: string): number {
    const offsets = components.flatMap(component => {
        const pad = component.footprint.pads.find(item => padNet(component, item.pin_number) === targetNet);
        const offset = pad && getPadOffset(component, pad.pin_number, rotate, component.pcb.allowedLayers[0] ?? 'top');
        return offset ? [offset] : [];
    });
    return loadNativeBoardPacker().scorePlacementOrientation({kind:'targetPad', offsets, axis});
}

function chooseCompactAxis(components: PcbComponent[]) {
    const totalWidth = components.reduce((sum, component) => fp.add(sum, component.footprint.width), 0);
    const totalHeight = components.reduce((sum, component) => fp.add(sum, component.footprint.height), 0);
    return totalWidth <= totalHeight ? 'x' : 'y';
}

function parseIslandPairs(island: IslandNode): Array<[string, string]> {
    const pairs = island.data.pairs;
    if (!Array.isArray(pairs)) return [];
    return pairs
        .filter((pair): pair is [string, string] => Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string');
}

function pairDegree(island: IslandNode, designator: string) {
    return parseIslandPairs(island)
        .filter(([a, b]) => a.startsWith(`${designator}.`) || b.startsWith(`${designator}.`))
        .length;
}

function collectIslandNodes(root: PlacementTreeNode): IslandNode[] {
    const nodes: IslandNode[] = [];
    const visit = (node: PlacementTreeNode) => {
        if (node.kind === 'island' && isIslandKind(node.data?.kind)) nodes.push(node as IslandNode);
        for (const child of node.children) visit(child);
    };
    visit(root);
    return nodes;
}

function isIslandKind(kind: unknown): kind is IslandKind {
    return kind === 'line' || kind === 'bypass' || kind === 'cap_cluster' || kind === 'core_pairs';
}

function normalizedRotations(component: PcbComponent) {
    const rotations = component.pcb.allowedRotations.length ? component.pcb.allowedRotations : [0, 90, 180, 270];
    return [...new Set(rotations.map((rotation) => normalizeRotation(rotation)))];
}

function normalizeRotation(value: number) {
    return ((Math.round(value) % 360) + 360) % 360;
}

function candidatePlacement(component: PcbComponent, x: number, y: number, rotate: number): CandidatePlacement {
    const layer = component.pcb.allowedLayers[0] ?? 'top';
    const placement = { designator: component.designator, x, y, rotate, layer, score: 0 };
    return { ...placement, component, box: componentBox(component, placement) };
}

function centerPlacements(placements: CandidatePlacement[], grid: number) {
    if (placements.length === 0) return [];
    const bbox = unionBoxes(placements.map((placement) => placement.box));
    const dx = fp.div((fp.add(bbox.left, bbox.right)), 2);
    const dy = fp.div((fp.add(bbox.top, bbox.bottom)), 2);
    return placements.map((placement) => candidatePlacement(
        placement.component,
        roundPlacement(fp.sub(placement.x, dx)),
        roundPlacement(fp.sub(placement.y, dy)),
        placement.rotate,
    ));
}

function padWorld(components: PcbComponent[], placements: CandidatePlacement[], ref: string) {
    const [designator, pin] = ref.split('.');
    const component = components.find((item) => item.designator === designator);
    const placement = placements.find((item) => item.designator === designator);
    if (!component || !placement) return null;
    return padPoint(component, placement, pin);
}

function padPoint(component: PcbComponent, placement: Placement, pin: string | number) {
    const offset = getPadOffset(component, pin, placement.rotate, placement.layer);
    return offset ? { x: fp.add(placement.x, offset.x), y: fp.add(placement.y, offset.y) } : null;
}







function placementsBox(components: PcbComponent[], placements: Placement[]) {
    return unionBoxes(placements.map((placement) => {
        const component = components.find((item) => item.designator === placement.designator);
        return component ? componentBox(component, placement) : null;
    }).filter((box): box is Box => Boolean(box)));
}



function hasOverlap(components: PcbComponent[], placements: Placement[], clearanceResolver: ClearanceResolver) {
    for (let i = 0; i < placements.length; i += 1) {
        for (let j = i + 1; j < placements.length; j += 1) {
            const aComponent = components.find((component) => component.designator === placements[i].designator);
            const bComponent = components.find((component) => component.designator === placements[j].designator);
            if (!aComponent || !bComponent) continue;
            if (!placementsCanConflict(aComponent, placements[i], bComponent, placements[j])) continue;
            const clearance = clearanceResolver(aComponent.designator, bComponent.designator);
            const boxPairs = componentPairCollisionBoxPairs(aComponent, placements[i], bComponent, placements[j]);
            if (boxPairs.some((pair) => overlaps(pair.a, pair.b, clearance))) return true;
        }
    }
    return false;
}







function uniqueNumbers(values: number[]) {
    return [...new Set(values.filter((value) => Number.isFinite(value)).map((value) => roundPlacement(value)))];
}

function dedupePoints(points: Point[]) {
    const seen = new Set<string>();
    return points.filter((point) => {
        const key = `${roundPlacement(point.x)}:${roundPlacement(point.y)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}



function footprintArea(component: PcbComponent) {
    return fp.mul(component.footprint.width, component.footprint.height);
}

function snap(value: number, grid: number) {
    if (grid <= 0) return value;
    return fp.mul(Math.round(fp.div(value, grid)), grid);
}

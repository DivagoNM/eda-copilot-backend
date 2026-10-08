import type { ExistingPlacement, FootprintSpec, PcbComponent } from '../../types/pcb/layout-model.ts';
import type { PlacementRules } from '../../types/pcb/layout-rules.ts';
import { createBoard } from '../placement-input.ts';
import { normalizeFixedPlacement } from '../footprints.ts';
import { resolvePreservedComponentDesignators } from '../existing-placement.ts';
import { createFixedPlacement } from '../pcb-auto-place/fixed.ts';
import { boardOutlinePolygon, getBox, getLocalPointOffset, pointsBox, pointToPolygonDistance, pointToSegmentDistance } from '../pcb-auto-place/geometry.ts';
import { defaultSolverOptions, segmentIntersectsBox } from '../pcb-auto-place/utils.ts';
import { coordinateDifference } from '../coordinate-transport.ts';
import * as fp from '../f32.ts';

/** Advisory mechanics only; no footprint resolution, placement or scoring. */
export function createConnectorMechanics(rules: PlacementRules, footprints?: Record<string, FootprintSpec>, existing?: ExistingPlacement) {
    const preserved = resolvePreservedComponentDesignators(rules.preserve, existing);
    const bounds = rules.board.type === 'polygon' ? pointsBox(rules.board.points) : undefined;
    // Source-coordinate transport: match the shared board builder's polygon centering.
    const origin = bounds ? { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 } : { x: 0, y: 0 };
    return (source: string, maxEdgeDistance: number): string | undefined => {
        const rule = rules.component_rules.find(c => c.designator === source);
        const old = preserved.has(source) ? existing?.components.find(c => c.designator === source) : undefined;
        const footprint = footprints?.[source];
        let fixed = normalizeFixedPlacement(rule?.fixedPlacement);
        if (old) {
            const offset = footprint?.sourceOriginOffset ? getLocalPointOffset(footprint.sourceOriginOffset, old.rotate, old.layer) : { x: 0, y: 0 };
            fixed = { x: fp.sub(coordinateDifference(old.x, origin.x), offset.x), y: fp.sub(coordinateDifference(old.y, origin.y), offset.y),
                rotate: old.rotate, layer: old.layer };
        } else if (fixed) {
            fixed = { ...fixed, ...(fixed.x !== undefined ? { x: coordinateDifference(fixed.x, origin.x) } : {}),
                ...(fixed.y !== undefined ? { y: coordinateDifference(fixed.y, origin.y) } : {}) };
        } else if (rule?.edgeMount) return undefined; // Includes sliding mounts: their normal coordinate is bound to the edge.
        else if (rule?.edgePlace) {
            const inset = fp.max(0, rule.edgePlace.inset ?? 0);
            return fp.sub(inset, maxEdgeDistance) > fp.PCB_PLACEMENT_EPSILON
                ? `Connector ${source} has an edgePlace inset of ${inset} mm, exceeding the ${maxEdgeDistance} mm edge-proximity guideline. Review its mechanical placement.`
                : undefined;
        }
        if (!fixed) return `Connector ${source} has no fixed or mechanical edge placement. Use fixed(), edgeMount(), edgePlace(), or preserve an existing position; review its access at the board edge.`;
        if (!fixed.anchor && (fixed.x === undefined || fixed.y === undefined))
            return `Connector ${source} fixed placement does not define a complete position. Provide x/y or a board anchor and review its access at the board edge.`;
        const board = rules.board.type === 'auto' ? undefined : createBoard(rules.board, []);
        if (!board) return `Connector ${source} has a fixed position, but its proximity to the board edge cannot be checked without an explicit board outline. Review its mechanical placement.`;
        const component: PcbComponent = { designator: source, value: '', pins: [], block_name: '', search_query: '', part_uuid: null,
            footprint: footprint ?? { name: 'unknown', width: 0, height: 0, pads: [] },
            pcb: { role: 'connector', allowedLayers: rule?.allowedLayers ?? board.allowedLayers,
                allowedRotations: rule?.allowedRotations ?? [0], fixedPlacement: fixed } };
        const pose = createFixedPlacement({ board, components: [component], constraintRegions: [], blocks: [], modules: [], hints: [], solverOptions: defaultSolverOptions }, component)!;
        const outline = boardOutlinePolygon(board);
        let distance = pointToPolygonDistance(pose, outline);
        if (footprint) {
            const box = getBox(component, pose);
            const corners = [{ x: box.left, y: box.top }, { x: box.right, y: box.top }, { x: box.right, y: box.bottom }, { x: box.left, y: box.bottom }];
            distance = fp.min(...outline.map((a, i) => {
                const b = outline[(i + 1) % outline.length];
                if (segmentIntersectsBox(a, b, box)) return 0;
                return fp.min(...corners.flatMap((corner, j) => [pointToSegmentDistance(corner, a, b),
                    pointToSegmentDistance(a, corner, corners[(j + 1) % corners.length])]));
            }));
        }
        if (!Number.isFinite(distance)) return `Connector ${source} edge proximity could not be evaluated from the authored geometry. Review its mechanical placement.`;
        return fp.sub(distance, maxEdgeDistance) > fp.PCB_PLACEMENT_EPSILON
            ? `Connector ${source} is fixed ${distance.toFixed(2)} mm from the board outline (${footprint ? 'footprint bounding box' : 'component center; footprint unavailable'}), exceeding the ${maxEdgeDistance} mm edge-proximity guideline. Review its mechanical placement.`
            : undefined;
    };
}

import type { BoardEdge, PlacementRelation } from '#types/pcb/layout-model.ts';
import type { NativeRelation } from './contract.ts';

/** The same authored condition payload feeds both native placement stages. */
export function encodeRelation(relation: PlacementRelation): NativeRelation {
    return {
        condition: relation.data?.condition as NativeRelation['condition'],
        id: relation.id,
        kind: relation.kind,
        from: relation.from,
        to: relation.to,
        relation: relation.relation,
        priority: relation.priority,
        hard: relation.hard === true,
        weight: relation.weight,
        effect: relation.effect,
        maxDistance: finiteOptional(relation.data?.maxDistance),
        minDistance: finiteOptional(relation.data?.minDistance),
        satelliteAnchor: relation.data?.satelliteAnchor === true,
        anchorOffset: pointOptional(relation.data?.anchorOffset),
        sidePreference: boardEdgeOptional(relation.data?.sidePreference),
        core: relation.data?.core === true,
        pathId: stringOptional(relation.data?.pathId),
        pathShape: relation.data?.pathShape === 'straight' ? 'straight' : relation.data?.pathShape === 'flexible' ? 'flexible' : undefined,
        preferFacingPads: relation.data?.preferFacingPads === true,
    };
}

function finiteOptional(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pointOptional(value: unknown) {
    if (!value || typeof value !== 'object') return undefined;
    const point = value as { x?: unknown; y?: unknown };
    return typeof point.x === 'number' && Number.isFinite(point.x)
        && typeof point.y === 'number' && Number.isFinite(point.y)
        ? { x: point.x, y: point.y }
        : undefined;
}

function boardEdgeOptional(value: unknown): BoardEdge | undefined {
    return value === 'left' || value === 'right' || value === 'top' || value === 'bottom' ? value : undefined;
}

function stringOptional(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

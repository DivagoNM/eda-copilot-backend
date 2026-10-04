import * as fp from '../f32.ts';
import { loadNativeBoardPacker } from '../pcb-auto-place-v2/native/load-native-board-packer.ts';
import type { HintPriority, NumericRule, PlacementHint, PlacementInput } from '#types/pcb/layout-model.ts';

export function expandHints(input: PlacementInput): NumericRule[] {
    return input.hints.flatMap((hint): NumericRule[] => {
        const profile = () => loadNativeBoardPacker().placementRelationProfile({
            relation: hint.relation,
            priority: hint.priority,
            ...(hint.relation === 'critical_pair' ? {
                weight: fp.mul(priorityWeight(hint.priority), hint.weightMultiplier ?? 1),
                minDistance: hint.minDistance,
                maxDistance: hint.maxDistance,
                path: Boolean(hint.path),
                core: hint.core,
                hard: hint.hard ?? (hint.path ? false : hint.priority === 'critical'),
            } : {}),
        });
        const weight = priorityWeight(hint.priority);

        if (hint.relation === 'line' || hint.relation === 'bypass' || hint.relation === 'cap_cluster') {
            return [];
        }

        if (hint.relation === 'critical_pair') {
            return [{
                kind: 'distance',
                source: hint.source,
                target: hint.target,
                ...profile(),
                hard: !hint.core && (hint.hard ?? (hint.path ? false : hint.priority === 'critical')),
                criticalPair: true,
                corePair: hint.core,
                crossingPenalty: hint.crossingPenalty ?? (hint.core ? 2 : 0),
                preferFacingPads: hint.preferFacingPads ?? hint.core === true,
            }];
        }

        if (hint.relation === 'edge') {
            return [{
                kind: 'edge',
                source: hint.source,
                edge: hint.edge,
                orientation: hint.orientation ?? 'any',
                max: fp.add(input.board.clearances.edge, 0.5),
                weight,
                hard: hint.priority === 'critical',
            }];
        }

        if (hint.relation === 'prefer_layer') {
            return [{ kind: 'prefer_layer', source: hint.source, layer: hint.layer, weight }];
        }

        if (hint.relation === 'same_side') {
            return [{ kind: 'same_side', source: hint.source, target: hint.target, weight }];
        }

        if (hint.relation === 'away_from') {
            return [{ kind: 'clearance', source: hint.source, target: hint.target, min: semanticDistance('away_from', hint.priority), weight }];
        }

        if (hint.relation === 'clearance') {
            return [{ kind: 'clearance', source: hint.source, target: hint.target, min: hint.min, weight, hard: hint.priority === 'critical' }];
        }

        return [{
            kind: 'distance',
            source: hint.source,
            target: hint.target,
            ...profile(),
            hard: hint.relation === 'very_near' && hint.priority === 'critical',
        }];
    });
}

export function priorityWeight(priority: HintPriority) {
    return loadNativeBoardPacker().placementPriorityWeight(priority);
}

function semanticDistance(relation: PlacementHint['relation'], priority: HintPriority) {
    if (relation === 'away_from') return priority === 'high' || priority === 'critical' ? 12 : 8;
    return 8;
}

/** Same max-per-segment topology weight as Rust signal_path::path_metadata. */
export function pathRelationWeight(input: PlacementInput, pathId: string): number {
    let weight: number | undefined;
    for (const hint of input.hints) {
        if (hint.relation !== 'critical_pair' || hint.path?.id !== pathId) continue;
        const profile = loadNativeBoardPacker().placementRelationProfile({
            relation: 'critical_pair', priority: hint.priority, path: true,
            weight: fp.mul(priorityWeight(hint.priority), hint.weightMultiplier ?? 1),
        });
        weight = fp.max(weight ?? 0, profile.topologyWeight);
    }
    return weight ?? loadNativeBoardPacker().placementRelationProfile({
        relation: 'critical_pair', path: true,
        priority: input.paths?.find(p => p.id === pathId)?.priority ?? 'normal',
    }).topologyWeight;
}

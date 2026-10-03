import type {
    BlockRole,
    Box,
    PcbComponent,
    PlacementRelation,
    PlacementTreeNode,
} from '#types/pcb/layout-model.ts';
import type { ClearanceResolver } from '../pcb-auto-place/clearance-resolver.ts';
import type { PlacementPrimitive } from './primitives.ts';

/** Input contract for the Rust block solver. Search and scoring live in the native crate. */
export interface BlockSolverOptions {
    /** Authored input for the same scoped numeric hints used by checkpoint scoring. */
    scoreInput?: import('#types/pcb/layout-model.ts').PlacementInput;
    /** Real board frame for a family with fixed mechanical anchors. */
    worldInput?: import('#types/pcb/layout-model.ts').PlacementInput;
    experiments?: import('./block-policy.ts').BlockExperiments;
    grid: number;
    clearance: number;
    componentByDesignator?: Map<string, PcbComponent>;
    blockRoleByName?: Map<string, BlockRole>;
    clearanceResolver?: ClearanceResolver;
    targetWidth?: number;
    targetHeight?: number;
    bounds?: Box;
    collisionMode?: 'components' | 'envelope' | 'hybrid';
    hardCollisionMode?: 'components' | 'primitive';
    candidateBoxMode?: 'bbox' | 'collision';
    obstacles?: Box[];
    searchWidth?: number;
    compactness?: 'normal' | 'high';
}

export interface BlockSolveParams {
    node: PlacementTreeNode;
    primitives: PlacementPrimitive[];
    relations: PlacementRelation[];
    options: BlockSolverOptions;
}

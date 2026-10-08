import type { ExplainCircuit } from '../../../types/circuit.ts';
import type { FootprintSpec } from '../../../types/pcb/layout-model.ts';

export type CircuitPinRef = { designator: string; pin_number: string | number };
export type CircuitPlacementPurpose = 'antenna' | 'cold-junction' | 'ambient-temperature' | 'monitored-temperature' | 'magnetic-sensor' | 'quiet-controller' | 'external-load';
export type CircuitPatternRequirement =
    | { relation: 'local'; source: CircuitPinRef; target: CircuitPinRef; alternatives?: Array<{ source: CircuitPinRef; target: CircuitPinRef }>; minimumPriority?: 'high' | 'critical' }
    | { relation: 'supply-group'; targets: CircuitPinRef[]; capacitors: CircuitPinRef[] }
    | { relation: 'near' | 'away'; source: string; target: string; minDistance?: number }
    | { relation: 'edge'; source: string; edge: 'left' | 'right' | 'top' | 'bottom' }
    | { relation: 'rotation'; source: string; allowed: number[] }
    | { relation: 'connector-placement'; source: string; maxEdgeDistance: number }
    | { relation: 'separate-group'; source: string; target: string }
    | { relation: 'balanced'; branches: Array<{ source: CircuitPinRef; target: CircuitPinRef }>; maxDifference: number; ambiguous?: boolean }
    | { relation: 'alignment'; source: string; target: string; axis: 'x' | 'y' | 'both'; tolerance: number; offset?: { x: number; y: number } }
    | { relation: 'keepout'; source: string; region: string; minimumWidth?: number; minimumHeight?: number;
        layers?: Array<'top' | 'bottom'>; allowBlocks?: string[] };
/** Verified device/application facts. These are never inferred from MPN substrings. */
export type CircuitPatternKnowledge = {
    components?: Record<string, {
        kind?: string;
        functions?: string[];
        pinFunctions?: Record<string, string>;
        /** Each confirmed channel maps canonical function names to physical pins. */
        channels?: Record<string, Record<string, string | number>>;
        entryChain?: { connector: string; receiver: string; protection?: { component: string; side: 'connector' | 'receiver' } };
        branchLengthTolerance?: number;
        preferredGateResistorSide?: 'driver' | 'device';
        supplyGroups?: Array<Array<string | number>>;
        /** Confirmed interface endpoints and the layout priority required by this application. */
        interfaces?: Array<{
            function: 'qspi' | 'ospi';
            peer: string;
            signals: Array<{ source: string | number; target: string | number }>;
            minimumPriority?: 'high' | 'critical';
        }>;
        placement?: {
            purpose: CircuitPlacementPurpose;
            target?: string;
            avoid?: string[];
            edge?: 'left' | 'right' | 'top' | 'bottom';
            minDistance?: number;
            rotations?: number[];
            alignment?: { axis: 'x' | 'y' | 'both'; tolerance: number; offset?: { x: number; y: number } };
            keepout?: { region: string; minimumWidth?: number; minimumHeight?: number;
                layers?: Array<'top' | 'bottom'>; allowBlocks?: string[] };
        };
    }>;
    isolation?: { domains: Record<string, string>; minClearance: number; pinDomains?: Record<string, Record<string, string>> };
};
export type CircuitPatternMatch = {
    patternId: string;
    components: string[];
    roles: Record<string, string>;
    pins: Record<string, CircuitPinRef>;
    nets: string[];
    requirements: CircuitPatternRequirement[];
    evidence: 'connectivity' | 'verified-profile' | 'footprint';
};
export type DetectCircuitPatternsInput = {
    circuit: ExplainCircuit;
    knowledge?: CircuitPatternKnowledge;
    footprints?: Record<string, FootprintSpec>;
    /** Explicit mechanical roles, for example authored component(...).role('connector'). */
    componentRoles?: Record<string, 'connector'>;
};
export type PatternNode = {
    id: string;
    optional?: boolean;
    kind?: string;
    placementRole?: 'connector';
    kinds?: string[];
    pinCount?: number;
    withoutPins?: string[];
    withoutFunctions?: string[];
    functions?: string[];
    /** Aliases for a uniquely identified functional pin; '*' selects a passive terminal. */
    pins: Record<string, string[]>;
};
export type PatternLink = {
    from: string;
    to: string;
    /** Only selected edges imply a layout obligation. */
    local?: boolean;
};
export type PatternTopology = {
    nodes?: PatternNode[];
    links?: PatternLink[];
    differentNets?: Array<[string, string]>;
    /** Distinct physical terminals which may share one electrical net. */
    sameNets?: Array<[string, string]>;
};
export type CircuitPatternDefinition = PatternTopology & {
    id: string;
    title: string;
    prerequisites: string;
    variants?: PatternTopology[];
    placementPurposes?: CircuitPlacementPurpose[];
    placementFunctions?: string[];
    balancedBranches?: Array<{ owner: string; pairs: Array<[string, string]>; requiresFunctions?: Record<string, string> }>;
    gateResistorAnchors?: { driver: string; device: string };
    componentRequirements?: Array<{ role: string; relation: 'connector-placement'; maxEdgeDistance: number }>;
    entryChain?: boolean;
    special?: 'supply-groups' | 'shared-supply' | 'supply-domains' | 'controller-bias' | 'bulk-local' | 'placement' | 'isolation' | 'interface';
};

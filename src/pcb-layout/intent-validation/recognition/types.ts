import type { PcbIntentContext } from '../context.ts';
import type { PcbIntentDiagnostic } from '../types.ts';
import type { ExplainCircuit } from '../../../types/circuit.ts';
import type { FootprintSpec } from '../../../types/pcb/layout-model.ts';

export type CircuitPinRef = { designator: string; pin_number: string | number };
export type CircuitPatternRequirement =
    | { relation: 'local'; source: CircuitPinRef; target: CircuitPinRef; alternatives?: Array<{ source: CircuitPinRef; target: CircuitPinRef }> }
    | { relation: 'supply-group'; targets: CircuitPinRef[]; capacitors: CircuitPinRef[] }
    | { relation: 'connector-placement'; source: string; maxEdgeDistance: number }
    | { relation: 'mounting-holes'; minimumCount: number }
    | { relation: 'separate-group'; source: string; target: string };
export type CircuitPatternMatch = {
    patternId: string;
    components: string[];
    roles: Record<string, string>;
    pins: Record<string, CircuitPinRef>;
    nets: string[];
    requirements: CircuitPatternRequirement[];
};
export type DetectCircuitPatternsInput = {
    circuit: ExplainCircuit;
    footprints?: Record<string, FootprintSpec>;
    /** Explicit mechanical roles, for example authored component(...).role('connector'). */
    componentRoles?: Record<string, 'connector'>;
};
export type PatternNode = {
    id: string;
    optional?: boolean;
    kind?: string;
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
    check?: (match: CircuitPatternMatch, context: PcbIntentContext) => PcbIntentDiagnostic[];
    id: string;
    title: string;
    variants?: PatternTopology[];
    componentRequirements?: Array<{ role: string; relation: 'connector-placement'; maxEdgeDistance: number }>;
    boardRequirements?: Array<Extract<CircuitPatternRequirement, { relation: 'mounting-holes' }>>;
    special?: 'supply-groups' | 'shared-supply' | 'supply-domains' | 'controller-bias' | 'bulk-local' | 'interface';
};

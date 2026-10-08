import type { ExplainCircuit } from '../../../types/circuit.ts';
import type { FootprintSpec } from '../../../types/pcb/layout-model.ts';

export type CircuitPinRef = { designator: string; pin_number: string | number };
export type CircuitPatternRequirement =
    | { relation: 'local'; source: CircuitPinRef; target: CircuitPinRef; alternatives?: Array<{ source: CircuitPinRef; target: CircuitPinRef }> }
    | { relation: 'supply-group'; targets: CircuitPinRef[]; capacitors: CircuitPinRef[] }
    | { relation: 'near' | 'away'; source: string; target: string; minDistance?: number }
    | { relation: 'edge'; source: string; edge: 'left' | 'right' | 'top' | 'bottom' };
/** Verified device/application facts. These are never inferred from MPN substrings. */
export type CircuitPatternKnowledge = {
    components?: Record<string, {
        kind?: string;
        functions?: string[];
        pinFunctions?: Record<string, string>;
        supplyGroups?: Array<Array<string | number>>;
        placement?: {
            purpose: 'antenna' | 'cold-junction' | 'ambient-temperature' | 'monitored-temperature' | 'magnetic-sensor';
            target?: string;
            avoid?: string[];
            edge?: 'left' | 'right' | 'top' | 'bottom';
            minDistance?: number;
        };
    }>;
    isolation?: { domains: Record<string, string>; minClearance: number };
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
};
export type PatternNode = {
    id: string;
    optional?: boolean;
    kind?: string;
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
export type CircuitPatternDefinition = {
    id: string;
    title: string;
    prerequisites: string;
    nodes?: PatternNode[];
    links?: PatternLink[];
    differentNets?: Array<[string, string]>;
    special?: 'supply-groups' | 'shared-supply' | 'supply-domains' | 'bulk-local' | 'placement' | 'isolation';
};

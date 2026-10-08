import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "supply-domains",
    title: "Separate IC supply domains",
    prerequisites: "Named supply pins and distinct nets",
    special: "supply-domains",
};

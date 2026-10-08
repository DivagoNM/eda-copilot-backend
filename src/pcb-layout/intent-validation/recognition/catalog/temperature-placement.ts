import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "temperature-placement",
    placementPurposes: ['ambient-temperature', 'monitored-temperature'],
    title: "Temperature sensor purpose",
    prerequisites: "Explicit ambient/monitored role and heat/target component",
    special: "placement",
};

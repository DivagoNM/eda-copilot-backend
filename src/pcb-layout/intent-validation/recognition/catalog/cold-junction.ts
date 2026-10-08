import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "cold-junction",
    placementPurposes: ['cold-junction'],
    title: "Cold-junction sensor",
    prerequisites: "Confirmed thermocouple connector and CJC sensor",
    special: "placement",
};

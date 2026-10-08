import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "antenna-region",
    placementPurposes: ['antenna'],
    title: "Antenna region",
    prerequisites: "Confirmed antenna/module mechanical profile",
    special: "placement",
};

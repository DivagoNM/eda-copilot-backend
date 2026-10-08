import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "shared-rail-consumers",
    title: "Multiple consumers on one rail",
    prerequisites: "Named supply/return pins",
    special: "shared-supply",
};

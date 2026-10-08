import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "shared-rail-consumers",
    title: "Multiple consumers on one rail",
    special: "shared-supply",
};

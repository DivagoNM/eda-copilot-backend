import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: 'mounting-holes',
    title: 'Board mounting holes',
    prerequisites: 'Full-board mechanical intent; boardHole declarations or identified mounting-hole components',
    boardRequirements: [{ relation: 'mounting-holes', minimumCount: 1 }],
};

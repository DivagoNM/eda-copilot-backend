import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: 'connector-placement',
    title: 'Connector mechanical placement',
    prerequisites: 'Connector identity from J/P/CN designators, explicit mechanical role or verified connector kind; authored board outline for fixed-position distance',
    nodes: [{ id: 'connector', kind: 'connector', placementRole: 'connector', pins: {} }],
    componentRequirements: [{ role: 'connector', relation: 'connector-placement', maxEdgeDistance: 5 }],
};

import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "instrumentation-gain",
    title: "Instrumentation gain resistor",
    prerequisites: "Named RG pair",
    nodes: [
        {"id":"amp","pins":{"rg1":["RG1"],"rg2":["RG2"]}},
        {"id":"gain","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"amp.rg1","to":"gain.a","local":true},
        {"from":"amp.rg2","to":"gain.b","local":true},
    ],
};

import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "inductive-clamp",
    title: "Inductive load clamp",
    prerequisites: "Confirmed load and clamp roles; external mechanics if needed",
    nodes: [
        {"id":"load","kind":"inductive-load","pins":{"a":["*"],"b":["*"]}},
        {"id":"clamp","kind":"flyback-diode","pins":{"a":["A"],"k":["K"]}},
    ],
    links: [
        {"from":"load.a","to":"clamp.k","local":true},
        {"from":"load.b","to":"clamp.a","local":true},
    ],
};

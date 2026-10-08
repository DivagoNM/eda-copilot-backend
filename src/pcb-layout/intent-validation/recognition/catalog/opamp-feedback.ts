import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "opamp-feedback",
    title: "Op-amp feedback",
    prerequisites: "Unambiguous channel pin functions",
    nodes: [
        {"id":"amp","pins":{"out":["OUT","OUTPUT"],"minus":["IN-","INVERTING"],"plus":["IN+","NONINVERTING"]}},
        {"id":"feedback","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"amp.out","to":"feedback.a","local":true},
        {"from":"amp.minus","to":"feedback.b","local":true},
    ],
};

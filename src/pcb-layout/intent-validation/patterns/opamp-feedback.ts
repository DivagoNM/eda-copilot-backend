import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "opamp-feedback",
    title: "Op-amp feedback",
    nodes: [
        {"id":"amp","pins":{"out":["OUT","OUTPUT"],"minus":["IN-","INVERTING"],"plus":["IN+","NONINVERTING"]}},
        {"id":"feedback","kinds":["resistor","capacitor"],"pinCount":2,"pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"amp.out","to":"feedback.a","local":true},
        {"from":"amp.minus","to":"feedback.b","local":true},
    ],
};

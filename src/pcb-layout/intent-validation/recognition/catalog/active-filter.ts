import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "active-filter",
    title: "Active analog filter",
    prerequisites: "Confirmed active-filter function",
    nodes: [
        {"id":"amp","functions":["active-filter"],"pins":{"out":["OUT"],"minus":["IN-"],"plus":["IN+"]}},
        {"id":"r1","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"r2","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"c1","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
        {"id":"c2","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"amp.out","to":"amp.minus"},
        {"from":"amp.plus","to":"r2.b","local":true},
        {"from":"r1.b","to":"r2.a","local":true},
        {"from":"r1.b","to":"c1.a","local":true},
        {"from":"c1.b","to":"amp.out","local":true},
        {"from":"amp.plus","to":"c2.a","local":true},
    ],
};

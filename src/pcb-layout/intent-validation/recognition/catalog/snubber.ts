import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "snubber",
    title: "Switch snubber/clamp",
    prerequisites: "Confirmed switch/snubber roles",
    nodes: [
        {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"switch.d","to":"resistor.a","local":true},
        {"from":"resistor.b","to":"cap.a","local":true},
        {"from":"cap.b","to":"switch.s","local":true},
    ],
};

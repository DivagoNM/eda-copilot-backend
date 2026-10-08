import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "flyback-primary",
    title: "Flyback primary",
    prerequisites: "Confirmed transformer winding roles and flyback primary",
    nodes: [
        {"id":"winding","kind":"transformer","pins":{"a":["PRI+","PRIMARY+"],"b":["PRI-","PRIMARY-"]}},
        {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
        {"id":"inputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"winding.a","to":"inputCap.a","local":true},
        {"from":"winding.b","to":"switch.d","local":true},
        {"from":"switch.s","to":"inputCap.b","local":true},
    ],
};

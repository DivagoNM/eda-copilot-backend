import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "parallel-gates",
    title: "Parallel MOSFET gate resistors",
    nodes: [
        {"id":"driver","functions":["gate-driver"],"pins":{"out":["OUT","GATE","DRV"]}},
        {"id":"r1","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"q1","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
        {"id":"r2","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"q2","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
    ],
    links: [
        {"from":"driver.out","to":"r1.a"},
        {"from":"r1.b","to":"q1.g","local":true},
        {"from":"driver.out","to":"r2.a"},
        {"from":"r2.b","to":"q2.g","local":true},
        {"from":"q1.s","to":"q2.s"},
        {"from":"q1.d","to":"q2.d"},
    ],
};

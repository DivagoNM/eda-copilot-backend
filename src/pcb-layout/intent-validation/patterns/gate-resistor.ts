import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "gate-resistor",
    title: "Gate series resistor",
    nodes: [
        {"id":"driver","functions":["gate-driver"],"pins":{"out":["OUT","GATE","DRV"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
    ],
    links: [
        {"from":"driver.out","to":"resistor.a","local":true},
        {"from":"resistor.b","to":"switch.g","local":true},
    ],
};

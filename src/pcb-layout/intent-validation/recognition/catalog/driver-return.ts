import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "driver-return",
    title: "Gate driver return",
    prerequisites: "Confirmed driver output/return and device pins",
    nodes: [
        {"id":"driver","functions":["gate-driver"],"pins":{"out":["OUT","GATE","DRV"],"return":["VSS","COM","VEE"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
    ],
    links: [
        {"from":"driver.out","to":"resistor.a"},
        {"from":"resistor.b","to":"switch.g"},
        {"from":"driver.return","to":"switch.s","local":true},
    ],
};

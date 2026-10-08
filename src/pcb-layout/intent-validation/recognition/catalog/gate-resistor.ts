import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "gate-resistor",
    title: "Gate series resistor",
    prerequisites: "OUT and G/S/D or confirmed functions",
    gateResistorAnchors: { driver: 'driver', device: 'switch' },
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

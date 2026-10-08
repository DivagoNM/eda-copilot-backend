import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "can-split-termination",
    title: "CAN split termination",
    prerequisites: "Confirmed CAN endpoint",
    nodes: [
        {"id":"can","functions":["can-endpoint"],"pins":{"high":["CANH"],"low":["CANL"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"highR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"lowR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"can.high","to":"highR.a","local":true},
        {"from":"can.low","to":"lowR.a","local":true},
        {"from":"highR.b","to":"lowR.b","local":true},
        {"from":"highR.b","to":"cap.a","local":true},
        {"from":"cap.b","to":"can.g"},
    ],
};

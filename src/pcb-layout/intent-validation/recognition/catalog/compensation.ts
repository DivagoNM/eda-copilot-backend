import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "compensation",
    title: "COMP network",
    prerequisites: "COMP pin and connected RC",
    nodes: [
        {"id":"ic","pins":{"comp":["COMP"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"ic.comp","to":"resistor.a","local":true},
        {"from":"resistor.b","to":"cap.a","local":true},
        {"from":"cap.b","to":"ic.g"},
    ],
};

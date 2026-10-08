import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "controller-bias",
    title: "Controller power and bias",
    prerequisites: "Named PVIN/AVIN/BIAS pins",
    nodes: [
        {"id":"ic","pins":{"power":["PVIN"],"bias":["AVIN","BIAS"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"powerCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
        {"id":"biasCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"ic.power","to":"powerCap.a","local":true},
        {"from":"powerCap.b","to":"ic.g"},
        {"from":"ic.bias","to":"biasCap.a","local":true},
        {"from":"biasCap.b","to":"ic.g"},
    ],
};

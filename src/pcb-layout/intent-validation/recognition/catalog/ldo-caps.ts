import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "ldo-caps",
    title: "LDO input/output capacitors",
    prerequisites: "Confirmed LDO kind and IN/OUT/GND",
    nodes: [
        {"id":"ic","functions":["ldo"],"pins":{"input":["IN","VIN"],"output":["OUT","VOUT"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"inputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
        {"id":"outputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"ic.input","to":"inputCap.a","local":true},
        {"from":"inputCap.b","to":"ic.g"},
        {"from":"ic.output","to":"outputCap.a","local":true},
        {"from":"outputCap.b","to":"ic.g"},
    ],
};

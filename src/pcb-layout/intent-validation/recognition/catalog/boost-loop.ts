import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "boost-loop",
    title: "Boost output loop",
    prerequisites: "Confirmed boost kind and connected switching graph",
    nodes: [
        {"id":"ic","functions":["boost"],"pins":{"sw":["SW","LX"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"inductor","kind":"inductor","pins":{"a":["*"],"b":["*"]}},
        {"id":"diode","kind":"diode","pins":{"a":["A"],"k":["K","C"]}},
        {"id":"outputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"ic.sw","to":"inductor.b","local":true},
        {"from":"ic.sw","to":"diode.a","local":true},
        {"from":"diode.k","to":"outputCap.a","local":true},
        {"from":"outputCap.b","to":"ic.g","local":true},
    ],
};

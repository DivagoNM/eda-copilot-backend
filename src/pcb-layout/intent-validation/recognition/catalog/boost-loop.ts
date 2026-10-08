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
    variants: [
        {
            nodes: [
                {"id":"controller","functions":["boost"],"pins":{"gate":["OUT","GATE","DRV"]}},
                {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"inductor","kind":"inductor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"diode","kind":"diode","pins":{"a":["A"],"k":["K","C"]}},
                {"id":"outputCap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"controller.gate","to":"switch.g"},
                {"from":"switch.d","to":"inductor.b","local":true},
                {"from":"switch.d","to":"diode.a","local":true},
                {"from":"diode.k","to":"outputCap.a","local":true},
                {"from":"switch.s","to":"outputCap.b","local":true},
            ],
        },
    ],
};

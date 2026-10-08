import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "buck-loop",
    title: "Buck commutation loop",
    prerequisites: "Confirmed buck or SW/VIN/GND plus connected L/diode",
    nodes: [
        {"id":"ic","pins":{"input":["VIN","PVIN"],"sw":["SW","LX","PH"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"inductor","kind":"inductor","pins":{"a":["*"],"b":["*"]}},
        {"id":"inputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
        {"id":"diode","kind":"diode","optional":true,"pins":{"a":["A"],"k":["K","C"]}},
    ],
    links: [
        {"from":"ic.sw","to":"inductor.a","local":true},
        {"from":"ic.sw","to":"diode.k","local":true},
        {"from":"diode.a","to":"ic.g","local":true},
        {"from":"ic.input","to":"inputCap.a","local":true},
        {"from":"inputCap.b","to":"ic.g","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"controller","functions":["buck"],"pins":{"high":["HG","HO","GH"],"low":["LG","LO","GL"]}},
                {"id":"high","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"low","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"inductor","kind":"inductor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"inputCap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"controller.high","to":"high.g"},
                {"from":"controller.low","to":"low.g"},
                {"from":"high.d","to":"inputCap.a","local":true},
                {"from":"high.s","to":"low.d","local":true},
                {"from":"high.s","to":"inductor.a","local":true},
                {"from":"low.s","to":"inputCap.b","local":true},
            ],
        },
        {
            nodes: [
                {"id":"controller","functions":["buck"],"pins":{"gate":["OUT","GATE","DRV"]}},
                {"id":"high","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"diode","kind":"diode","pins":{"a":["A"],"k":["K","C"]}},
                {"id":"inductor","kind":"inductor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"inputCap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"controller.gate","to":"high.g"},
                {"from":"high.d","to":"inputCap.a","local":true},
                {"from":"high.s","to":"diode.k","local":true},
                {"from":"high.s","to":"inductor.a","local":true},
                {"from":"diode.a","to":"inputCap.b","local":true},
            ],
        },
    ],
};

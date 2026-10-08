import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "buck-boost-loops",
    title: "Four-switch buck-boost",
    prerequisites: "Confirmed topology and SW1/SW2/VIN/VOUT",
    nodes: [
        {"id":"ic","functions":["buck-boost"],"pins":{"sw1":["SW1","LX1"],"sw2":["SW2","LX2"],"input":["VIN"],"output":["VOUT"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"inductor","kind":"inductor","pins":{"a":["*"],"b":["*"]}},
        {"id":"inputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
        {"id":"outputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"ic.sw1","to":"inductor.a","local":true},
        {"from":"ic.sw2","to":"inductor.b","local":true},
        {"from":"ic.input","to":"inputCap.a","local":true},
        {"from":"inputCap.b","to":"ic.g","local":true},
        {"from":"ic.output","to":"outputCap.a","local":true},
        {"from":"outputCap.b","to":"ic.g","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"controller","functions":["buck-boost"],"pins":{"gh1":["HG1"],"gl1":["LG1"],"gh2":["HG2"],"gl2":["LG2"]}},
                {"id":"high1","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"low1","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"high2","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"low2","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"inductor","kind":"inductor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"inputCap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"outputCap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"controller.gh1","to":"high1.g"},
                {"from":"controller.gl1","to":"low1.g"},
                {"from":"controller.gh2","to":"high2.g"},
                {"from":"controller.gl2","to":"low2.g"},
                {"from":"high1.d","to":"inputCap.a","local":true},
                {"from":"high1.s","to":"low1.d","local":true},
                {"from":"high1.s","to":"inductor.a","local":true},
                {"from":"low1.s","to":"inputCap.b","local":true},
                {"from":"high2.d","to":"outputCap.a","local":true},
                {"from":"high2.s","to":"low2.d","local":true},
                {"from":"high2.s","to":"inductor.b","local":true},
                {"from":"low2.s","to":"outputCap.b","local":true},
                {"from":"inputCap.b","to":"outputCap.b"},
            ],
        },
    ],
};

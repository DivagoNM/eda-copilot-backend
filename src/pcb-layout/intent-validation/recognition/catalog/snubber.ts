import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "snubber",
    title: "Switch snubber/clamp",
    prerequisites: "Confirmed switch/snubber roles",
    nodes: [
        {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"switch.d","to":"resistor.a","local":true},
        {"from":"resistor.b","to":"cap.a","local":true},
        {"from":"cap.b","to":"switch.s","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"switch.d","to":"cap.a","local":true},
                {"from":"cap.b","to":"resistor.a","local":true},
                {"from":"resistor.b","to":"switch.s","local":true},
            ],
        },
        {
            nodes: [
                {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"diode","kind":"diode","pins":{"a":["A"],"k":["K","C"]}},
                {"id":"resistor","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"cap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"switch.d","to":"diode.a","local":true},
                {"from":"diode.k","to":"cap.a","local":true},
                {"from":"diode.k","to":"resistor.a","local":true},
                {"from":"cap.b","to":"switch.s","local":true},
                {"from":"resistor.b","to":"switch.s","local":true},
            ],
        },
        {
            nodes: [
                {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"winding","kind":"transformer","pins":{"high":["PRI+"],"low":["PRI-"]}},
                {"id":"diode","kind":"diode","pins":{"a":["A"],"k":["K","C"]}},
                {"id":"resistor","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"cap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"switch.d","to":"winding.low"},
                {"from":"switch.d","to":"diode.a","local":true},
                {"from":"diode.k","to":"cap.a","local":true},
                {"from":"diode.k","to":"resistor.a","local":true},
                {"from":"cap.b","to":"winding.high","local":true},
                {"from":"resistor.b","to":"winding.high","local":true},
            ],
        },
        {
            nodes: [
                {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"clamp","kind":"tvs","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"switch.d","to":"clamp.a","local":true},
                {"from":"switch.s","to":"clamp.b","local":true},
            ],
        },
    ],
};

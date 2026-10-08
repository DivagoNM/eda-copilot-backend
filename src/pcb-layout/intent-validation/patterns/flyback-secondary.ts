import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "flyback-secondary",
    title: "Flyback secondary",
    nodes: [
        {"id":"winding","kind":"transformer","pins":{"a":["SEC+","SECONDARY+"],"b":["SEC-","SECONDARY-"]}},
        {"id":"diode","kind":"diode","pins":{"a":["A"],"k":["K","C"]}},
        {"id":"outputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"winding.a","to":"diode.a","local":true},
        {"from":"diode.k","to":"outputCap.a","local":true},
        {"from":"outputCap.b","to":"winding.b","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"winding","kind":"transformer","pins":{"a":["SEC+","SECONDARY+"],"b":["SEC-","SECONDARY-"]}},
                {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]},"functions":["flyback-secondary-switch"]},
                {"id":"outputCap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"winding.b","to":"switch.d","local":true},
                {"from":"switch.s","to":"outputCap.b","local":true},
                {"from":"winding.a","to":"outputCap.a","local":true},
            ],
        },
    ],
};

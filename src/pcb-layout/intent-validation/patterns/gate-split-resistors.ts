import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "gate-split-resistors",
    title: "Split turn-on/off paths",
    nodes: [
        {"id":"driver","functions":["gate-driver"],"pins":{"out":["OUT","GATE","DRV"]}},
        {"id":"on","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"off","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"diode","kind":"diode","pins":{"a":["A"],"k":["K","C"]}},
        {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
    ],
    links: [
        {"from":"driver.out","to":"on.a","local":true},
        {"from":"on.b","to":"switch.g","local":true},
        {"from":"driver.out","to":"diode.a","local":true},
        {"from":"diode.k","to":"off.a","local":true},
        {"from":"off.b","to":"switch.g","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"driver","functions":["gate-driver"],"pins":{"out":["OUT","GATE","DRV"]}},
                {"id":"on","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"off","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"diode","kind":"diode","pins":{"a":["A"],"k":["K","C"]}},
                {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
            ],
            links: [
                {"from":"driver.out","to":"on.a","local":true},
                {"from":"on.b","to":"switch.g","local":true},
                {"from":"driver.out","to":"diode.k","local":true},
                {"from":"diode.a","to":"off.a","local":true},
                {"from":"off.b","to":"switch.g","local":true},
            ],
        },
        {
            nodes: [
                {"id":"driver","functions":["gate-driver"],"pins":{"on":["OUTH","OUTON"],"off":["OUTL","OUTOFF"]}},
                {"id":"on","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"off","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
            ],
            links: [
                {"from":"driver.on","to":"on.a","local":true},
                {"from":"on.b","to":"switch.g","local":true},
                {"from":"driver.off","to":"off.a","local":true},
                {"from":"off.b","to":"switch.g","local":true},
            ],
        },
    ],
};

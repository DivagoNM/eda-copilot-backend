import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "driver-return",
    title: "Gate driver return",
    prerequisites: "Confirmed driver output/return and device pins",
    nodes: [
        {"id":"driver","functions":["gate-driver"],"pins":{"out":["OUT","GATE","DRV"],"return":["VSS","COM","VEE"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"switch","kind":"mosfet","withoutPins":["KS","KELVINSOURCE","SENSESOURCE"],"pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
    ],
    links: [
        {"from":"driver.out","to":"resistor.a"},
        {"from":"resistor.b","to":"switch.g"},
        {"from":"driver.return","to":"switch.s","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"driver","functions":["gate-driver"],"pins":{"out":["OUT","GATE","DRV"],"return":["VSS","COM","VEE"]}},
                {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"switch","pins":{"g":["G","GATE"],"s":["KS","KELVINSOURCE","SENSESOURCE"],"d":["D","DRAIN"]},"kinds":["mosfet","igbt"]},
            ],
            links: [
                {"from":"driver.out","to":"resistor.a"},
                {"from":"resistor.b","to":"switch.g"},
                {"from":"driver.return","to":"switch.s","local":true},
            ],
        },
        {
            nodes: [
                {"id":"driver","functions":["gate-driver"],"pins":{"out":["OUT","GATE","DRV"],"return":["VSS","COM","VEE"]}},
                {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"switch","pins":{"g":["G","GATE"],"s":["E","EMITTER"],"d":["C","COLLECTOR"]},"kinds":["igbt"],"withoutPins":["KE","KELVINEMITTER"]},
            ],
            links: [
                {"from":"driver.out","to":"resistor.a"},
                {"from":"resistor.b","to":"switch.g"},
                {"from":"driver.return","to":"switch.s","local":true},
            ],
        },
        {
            nodes: [
                {"id":"driver","functions":["gate-driver"],"pins":{"out":["OUT","GATE","DRV"],"return":["VSS","COM","VEE"]}},
                {"id":"resistor","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"switch","kind":"igbt","pins":{"g":["G","GATE"],"s":["KE","KELVINEMITTER"],"d":["C","COLLECTOR"]}},
            ],
            links: [
                {"from":"driver.out","to":"resistor.a"},
                {"from":"resistor.b","to":"switch.g"},
                {"from":"driver.return","to":"switch.s","local":true},
            ],
        },
    ],
};

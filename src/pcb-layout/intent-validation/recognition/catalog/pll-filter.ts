import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "pll-filter",
    title: "PLL loop filter",
    prerequisites: "Confirmed PLL, CP and VTUNE",
    nodes: [
        {"id":"pll","functions":["pll"],"pins":{"cp":["CP","CPOUT"],"tune":["VTUNE","TUNE"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"pll.cp","to":"resistor.a","local":true},
        {"from":"resistor.b","to":"pll.tune","local":true},
        {"from":"pll.tune","to":"cap.a","local":true},
        {"from":"cap.b","to":"pll.g"},
    ],
    variants: [
        {
            nodes: [
                {"id":"pll","functions":["pll"],"pins":{"cp":["CP","CPOUT"],"g":["GND","VSS","AGND"]}},
                {"id":"vco","functions":["vco"],"pins":{"tune":["VTUNE","TUNE"]}},
                {"id":"resistor","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"cap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"pll.cp","to":"resistor.a","local":true},
                {"from":"resistor.b","to":"vco.tune","local":true},
                {"from":"vco.tune","to":"cap.a","local":true},
                {"from":"cap.b","to":"pll.g"},
            ],
        },
        {
            nodes: [
                {"id":"pll","functions":["pll"],"pins":{"cp":["CP","CPOUT"],"g":["GND","VSS","AGND"]}},
                {"id":"vco","functions":["vco"],"pins":{"tune":["VTUNE","TUNE"]}},
                {"id":"r1","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"r2","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"c1","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"c2","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"pll.cp","to":"r1.a","local":true},
                {"from":"r1.b","to":"r2.a","local":true},
                {"from":"r1.b","to":"c1.a","local":true},
                {"from":"c1.b","to":"pll.g"},
                {"from":"r2.b","to":"vco.tune","local":true},
                {"from":"vco.tune","to":"c2.a","local":true},
                {"from":"c2.b","to":"pll.g"},
            ],
        },
    ],
};

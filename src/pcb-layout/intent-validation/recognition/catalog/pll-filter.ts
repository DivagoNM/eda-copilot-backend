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
};

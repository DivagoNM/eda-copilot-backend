import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "active-oscillator",
    title: "Active oscillator",
    prerequisites: "Confirmed oscillator, VDD/GND/OUT",
    nodes: [
        {"id":"osc","functions":["oscillator"],"pins":{"v":["VDD","VCC"],"g":["GND","VSS","AGND","PGND","DGND","VEE"],"out":["OUT","CLK"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
        {"id":"receiver","pins":{"clock":["CLKIN","CLK","MCLK"]}},
    ],
    links: [
        {"from":"osc.v","to":"cap.a","local":true},
        {"from":"osc.g","to":"cap.b"},
        {"from":"osc.out","to":"receiver.clock","local":true},
    ],
};

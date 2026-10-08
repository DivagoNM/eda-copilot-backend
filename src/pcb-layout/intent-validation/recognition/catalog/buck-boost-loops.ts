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
};

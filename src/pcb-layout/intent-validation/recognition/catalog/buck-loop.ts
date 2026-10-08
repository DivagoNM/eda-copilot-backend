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
};

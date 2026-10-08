import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "driver-decoupling",
    title: "Driver decoupling",
    nodes: [
        {"id":"driver","functions":["gate-driver"],"pins":{"v":["VDD","VCC"],"g":["VSS","COM","GND","VEE"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"driver.v","to":"cap.a","local":true},
        {"from":"driver.g","to":"cap.b","local":true},
    ],
};

import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "filtered-supply",
    title: "Filtered supply decoupling",
    nodes: [
        {"id":"load","pins":{"v":["VDD","VCC","VDDA","VDDIO","VCORE","AVIN","BIAS"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
        {"id":"filter","functions":["supply-filter"],"pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"load.v","to":"cap.a","local":true},
        {"from":"cap.b","to":"load.g"},
        {"from":"load.v","to":"filter.b"},
    ],
};

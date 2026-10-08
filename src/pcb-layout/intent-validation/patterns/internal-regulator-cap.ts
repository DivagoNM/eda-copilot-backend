import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "internal-regulator-cap",
    title: "VCAP/VREG capacitor",
    nodes: [
        {"id":"ic","pins":{"v":["VCAP","VREG"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"ic.v","to":"cap.a","local":true},
        {"from":"cap.b","to":"ic.g"},
    ],
};

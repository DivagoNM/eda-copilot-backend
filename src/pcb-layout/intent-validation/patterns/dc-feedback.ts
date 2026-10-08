import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "dc-feedback",
    title: "DC feedback divider",
    nodes: [
        {"id":"ic","pins":{"fb":["FB"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"upper","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"lower","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"ic.fb","to":"upper.b","local":true},
        {"from":"ic.fb","to":"lower.a","local":true},
        {"from":"lower.b","to":"ic.g"},
    ],
};

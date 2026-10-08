import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "dc-feedback",
    title: "DC feedback divider",
    prerequisites: "FB pin and two-resistor divider",
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

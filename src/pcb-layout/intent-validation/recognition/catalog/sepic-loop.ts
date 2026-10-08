import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "sepic-loop",
    title: "SEPIC transfer loop",
    prerequisites: "Confirmed SEPIC and connected graph",
    nodes: [
        {"id":"ic","functions":["sepic"],"pins":{"sw":["SW","LX"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"inputL","kind":"inductor","pins":{"a":["*"],"b":["*"]}},
        {"id":"returnL","kind":"inductor","pins":{"a":["*"],"b":["*"]}},
        {"id":"transferCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
        {"id":"diode","kind":"diode","pins":{"a":["A"],"k":["K","C"]}},
    ],
    links: [
        {"from":"ic.sw","to":"inputL.b","local":true},
        {"from":"ic.sw","to":"transferCap.a","local":true},
        {"from":"transferCap.b","to":"returnL.a","local":true},
        {"from":"returnL.b","to":"ic.g"},
        {"from":"transferCap.b","to":"diode.a","local":true},
    ],
};

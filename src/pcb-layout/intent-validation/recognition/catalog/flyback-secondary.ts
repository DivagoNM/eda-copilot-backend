import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "flyback-secondary",
    title: "Flyback secondary",
    prerequisites: "Confirmed winding roles",
    nodes: [
        {"id":"winding","kind":"transformer","pins":{"a":["SEC+","SECONDARY+"],"b":["SEC-","SECONDARY-"]}},
        {"id":"diode","kind":"diode","pins":{"a":["A"],"k":["K","C"]}},
        {"id":"outputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"winding.a","to":"diode.a","local":true},
        {"from":"diode.k","to":"outputCap.a","local":true},
        {"from":"outputCap.b","to":"winding.b","local":true},
    ],
};

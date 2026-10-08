import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "source-termination",
    title: "Source series termination",
    prerequisites: "Confirmed source termination/application direction",
    nodes: [
        {"id":"source","functions":["source-termination"],"pins":{"out":["OUT","CLK","TX"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"source.out","to":"resistor.a","local":true},
    ],
};

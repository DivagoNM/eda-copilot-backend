import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "source-termination",
    title: "Source series termination",
    nodes: [
        {"id":"source","functions":["source-termination"],"pins":{"out":["OUT","CLK","TX"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"source.out","to":"resistor.a","local":true},
    ],
};

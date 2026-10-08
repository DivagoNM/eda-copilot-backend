import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "opto-feedback",
    title: "Optocoupler feedback",
    nodes: [
        {"id":"opto","kind":"optocoupler","pins":{"a":["A"],"k":["K"],"c":["C"],"emitter":["E"]}},
        {"id":"ledR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"transistorR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"opto.a","to":"ledR.b","local":true},
        {"from":"opto.c","to":"transistorR.b","local":true},
    ],
};

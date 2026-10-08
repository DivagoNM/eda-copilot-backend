import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "ac-coupling-pair",
    title: "Differential AC coupling",
    prerequisites: "Confirmed differential transmitter/application placement side",
    nodes: [
        {"id":"tx","functions":["ac-coupling-source"],"pins":{"plus":["TX+","OUT+"],"minus":["TX-","OUT-"]}},
        {"id":"plusCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
        {"id":"minusCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"tx.plus","to":"plusCap.a","local":true},
        {"from":"tx.minus","to":"minusCap.a","local":true},
    ],
};

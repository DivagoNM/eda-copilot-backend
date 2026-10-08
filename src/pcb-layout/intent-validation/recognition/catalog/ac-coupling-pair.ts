import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "ac-coupling-pair",
    title: "Differential AC coupling",
    prerequisites: "Confirmed differential transmitter/application placement side",
    balancedBranches: [
        { owner: 'tx', pairs: [['tx.plus', 'plusCap.a'], ['tx.minus', 'minusCap.a']] },
        { owner: 'receiver', pairs: [['receiver.plus', 'plusC.b'], ['receiver.minus', 'minusC.b']] },
    ],
    nodes: [
        {"id":"tx","functions":["ac-coupling-source"],"pins":{"plus":["TX+","OUT+"],"minus":["TX-","OUT-"]}},
        {"id":"plusCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
        {"id":"minusCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"tx.plus","to":"plusCap.a","local":true},
        {"from":"tx.minus","to":"minusCap.a","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"receiver","functions":["ac-coupling-receiver"],"pins":{"plus":["RX+","IN+"],"minus":["RX-","IN-"]}},
                {"id":"plusC","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"minusC","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"receiver.plus","to":"plusC.b","local":true},
                {"from":"receiver.minus","to":"minusC.b","local":true},
            ],
        },
    ],
};

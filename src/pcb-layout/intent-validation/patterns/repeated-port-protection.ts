import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "repeated-port-protection",
    title: "Repeated connector protection",
    nodes: [
        {"id":"port1","kind":"connector","pins":{"signal":["*"]}},
        {"id":"esd1","kind":"esd","withoutFunctions":["ethernet-protection"],"pins":{"signal":["IO","LINE"]}},
        {"id":"port2","kind":"connector","pins":{"signal":["*"]}},
        {"id":"esd2","kind":"esd","withoutFunctions":["ethernet-protection"],"pins":{"signal":["IO","LINE"]}},
    ],
    links: [
        {"from":"port1.signal","to":"esd1.signal","local":true},
        {"from":"port2.signal","to":"esd2.signal","local":true},
    ],
    differentNets: [
        ["port1.signal","port2.signal"],
    ],
    variants: [
        {
            nodes: [
                {"id":"port1","kind":"connector","pins":{"signal":["*"]}},
                {"id":"port2","kind":"connector","pins":{"signal":["*"]}},
                {"id":"array","kind":"esd","withoutFunctions":["ethernet-protection"],"pins":{"line1":["IO1","LINE1"],"line2":["IO2","LINE2"]}},
            ],
            links: [
                {"from":"port1.signal","to":"array.line1","local":true},
                {"from":"port2.signal","to":"array.line2","local":true},
            ],
            differentNets: [
                ["port1.signal","port2.signal"],
            ],
        },
        {
            nodes: [
                {"id":"port1","kind":"connector","pins":{"signal":["*"]}},
                {"id":"port2","kind":"connector","pins":{"signal":["*"]}},
                {"id":"filter1","functions":["connector-filter"],"pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"filter2","functions":["connector-filter"],"pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"port1.signal","to":"filter1.a","local":true},
                {"from":"port2.signal","to":"filter2.a","local":true},
            ],
            differentNets: [
                ["port1.signal","port2.signal"],
            ],
        },
    ],
};

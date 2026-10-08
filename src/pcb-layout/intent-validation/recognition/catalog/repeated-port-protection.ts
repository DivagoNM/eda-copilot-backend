import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "repeated-port-protection",
    title: "Repeated connector protection",
    prerequisites: "Confirmed protection and multiple connectors",
    nodes: [
        {"id":"port1","kind":"connector","pins":{"signal":["*"]}},
        {"id":"esd1","kind":"esd","pins":{"signal":["IO","LINE"]}},
        {"id":"port2","kind":"connector","pins":{"signal":["*"]}},
        {"id":"esd2","kind":"esd","pins":{"signal":["IO","LINE"]}},
    ],
    links: [
        {"from":"port1.signal","to":"esd1.signal","local":true},
        {"from":"port2.signal","to":"esd2.signal","local":true},
    ],
    differentNets: [
        ["port1.signal","port2.signal"],
    ],
};

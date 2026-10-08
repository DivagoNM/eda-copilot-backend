import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "common-mode-choke",
    title: "Common-mode choke",
    prerequisites: "Confirmed coupled winding functions/protocol",
    nodes: [
        {"id":"choke","kind":"common-mode-choke","pins":{"inP":["IN+","1"],"outP":["OUT+","2"],"inN":["IN-","3"],"outN":["OUT-","4"]}},
        {"id":"connector","kind":"connector","pins":{"plus":["*"],"minus":["*"]}},
    ],
    links: [
        {"from":"connector.plus","to":"choke.inP","local":true},
        {"from":"connector.minus","to":"choke.inN","local":true},
    ],
};

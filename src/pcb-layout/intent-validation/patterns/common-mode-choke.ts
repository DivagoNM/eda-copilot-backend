import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "common-mode-choke",
    title: "Common-mode choke",
    nodes: [
        {"id":"choke","kind":"common-mode-choke","pins":{"inP":["IN+"],"outP":["OUT+"],"inN":["IN-"],"outN":["OUT-"]}},
        {"id":"connector","kind":"connector","pins":{"plus":["*"],"minus":["*"]}},
    ],
    links: [
        {"from":"connector.plus","to":"choke.inP","local":true},
        {"from":"connector.minus","to":"choke.inN","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"choke","kind":"common-mode-choke","pins":{"inP":["IN+"],"outP":["OUT+"],"inN":["IN-"],"outN":["OUT-"]}},
                {"id":"connector","kind":"connector","pins":{"plus":["*"],"minus":["*"]}},
                {"id":"receiver","functions":["common-mode-receiver"],"pins":{"plus":["RX+","IN+"],"minus":["RX-","IN-"]}},
            ],
            links: [
                {"from":"connector.plus","to":"choke.inP","local":true},
                {"from":"connector.minus","to":"choke.inN","local":true},
                {"from":"choke.outP","to":"receiver.plus","local":true},
                {"from":"choke.outN","to":"receiver.minus","local":true},
            ],
        },
    ],
};

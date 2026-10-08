import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "transimpedance",
    title: "Transimpedance amplifier",
    prerequisites: "Confirmed photodiode/current-source and amplifier pins",
    nodes: [
        {"id":"amp","pins":{"out":["OUT","OUTPUT"],"minus":["IN-","INVERTING"],"plus":["IN+","NONINVERTING"]}},
        {"id":"feedback","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"detector","kind":"photodiode","pins":{"a":["A"],"k":["K"]}},
    ],
    links: [
        {"from":"amp.out","to":"feedback.a","local":true},
        {"from":"amp.minus","to":"feedback.b","local":true},
        {"from":"amp.minus","to":"detector.k","local":true},
    ],
};

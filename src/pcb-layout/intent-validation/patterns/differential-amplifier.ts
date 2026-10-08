import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "differential-amplifier",
    title: "Discrete differential amplifier",
    nodes: [
        {"id":"amp","pins":{"out":["OUT","OUTPUT"],"minus":["IN-","INVERTING"],"plus":["IN+","NONINVERTING"]}},
        {"id":"feedback","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"inputMinus","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"inputPlus","kind":"resistor","withoutFunctions":["differential-return"],"pins":{"a":["*"],"b":["*"]}},
        {"id":"returnPlus","kind":"resistor","withoutFunctions":["differential-input"],"pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"amp.out","to":"feedback.a","local":true},
        {"from":"amp.minus","to":"feedback.b","local":true},
        {"from":"amp.minus","to":"inputMinus.b","local":true},
        {"from":"amp.plus","to":"inputPlus.b","local":true},
        {"from":"amp.plus","to":"returnPlus.a","local":true},
    ],
};

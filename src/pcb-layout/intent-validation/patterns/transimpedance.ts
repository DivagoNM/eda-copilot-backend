import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "transimpedance",
    title: "Transimpedance amplifier",
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
    variants: [
        {
            nodes: [
                {"id":"amp","pins":{"out":["OUT","OUTPUT"],"minus":["IN-","INVERTING"],"plus":["IN+","NONINVERTING"]}},
                {"id":"feedback","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"detector","kind":"photodiode","pins":{"a":["A"],"k":["K"]}},
                {"id":"feedbackCap","kind":"capacitor","pinCount":2,"optional":true,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"amp.out","to":"feedback.a","local":true},
                {"from":"amp.minus","to":"feedback.b","local":true},
                {"from":"amp.minus","to":"detector.k","local":true},
                {"from":"amp.out","to":"feedbackCap.a","local":true},
                {"from":"amp.minus","to":"feedbackCap.b","local":true},
            ],
        },
        {
            nodes: [
                {"id":"amp","pins":{"out":["OUT","OUTPUT"],"minus":["IN-","INVERTING"],"plus":["IN+","NONINVERTING"]}},
                {"id":"feedback","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"detector","kind":"current-source","pins":{"k":["OUT","SENSE"],"a":["RETURN","GND"]}},
                {"id":"feedbackCap","kind":"capacitor","pinCount":2,"optional":true,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"amp.out","to":"feedback.a","local":true},
                {"from":"amp.minus","to":"feedback.b","local":true},
                {"from":"amp.minus","to":"detector.k","local":true},
                {"from":"amp.out","to":"feedbackCap.a","local":true},
                {"from":"amp.minus","to":"feedbackCap.b","local":true},
            ],
        },
    ],
};

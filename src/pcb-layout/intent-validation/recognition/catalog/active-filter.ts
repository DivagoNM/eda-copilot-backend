import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "active-filter",
    title: "Active analog filter",
    prerequisites: "Confirmed active-filter function",
    nodes: [
        {"id":"amp","functions":["active-filter"],"pins":{"out":["OUT"],"minus":["IN-"],"plus":["IN+"]}},
        {"id":"r1","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"r2","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"c1","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
        {"id":"c2","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"amp.out","to":"amp.minus"},
        {"from":"amp.plus","to":"r2.b","local":true},
        {"from":"r1.b","to":"r2.a","local":true},
        {"from":"r1.b","to":"c1.a","local":true},
        {"from":"c1.b","to":"amp.out","local":true},
        {"from":"amp.plus","to":"c2.a","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"amp","functions":["active-filter"],"pins":{"out":["OUT"],"minus":["IN-"],"plus":["IN+"]}},
                {"id":"inputR","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"sumR","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"feedbackR","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"feedbackC","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"shuntC","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"inputR.b","to":"sumR.a","local":true},
                {"from":"inputR.b","to":"feedbackR.a","local":true},
                {"from":"inputR.b","to":"shuntC.a","local":true},
                {"from":"sumR.b","to":"amp.minus","local":true},
                {"from":"feedbackR.b","to":"amp.out","local":true},
                {"from":"feedbackC.a","to":"amp.minus","local":true},
                {"from":"feedbackC.b","to":"amp.out","local":true},
                {"from":"shuntC.b","to":"amp.plus"},
            ],
        },
    ],
};

import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "sense-input-filter",
    title: "Sense amplifier filter",
    nodes: [
        {"id":"amp","functions":["current-sense"],"pins":{"plus":["IN+","VIN+"],"minus":["IN-","VIN-"]}},
        {"id":"plusR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"minusR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"amp.plus","to":"plusR.b","local":true},
        {"from":"amp.minus","to":"minusR.b","local":true},
        {"from":"amp.plus","to":"cap.a","local":true},
        {"from":"amp.minus","to":"cap.b","local":true},
    ],
};

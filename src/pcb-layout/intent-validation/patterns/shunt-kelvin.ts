import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "shunt-kelvin",
    title: "Current shunt Kelvin sense",
    nodes: [
        {"id":"amp","functions":["current-sense"],"pins":{"plus":["IN+","VIN+"],"minus":["IN-","VIN-"]}},
        {"id":"shunt","kind":"shunt","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"amp.plus","to":"shunt.a","local":true},
        {"from":"amp.minus","to":"shunt.b","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"amp","functions":["current-sense"],"pins":{"plus":["IN+","VIN+"],"minus":["IN-","VIN-"]}},
                {"id":"shunt","kind":"shunt","pinCount":4,"pins":{"a":["SENSE+","KELVIN+","S+","VS+"],"b":["SENSE-","KELVIN-","S-","VS-"]}},
            ],
            links: [
                {"from":"amp.plus","to":"shunt.a","local":true},
                {"from":"amp.minus","to":"shunt.b","local":true},
            ],
        },
        {
            nodes: [
                {"id":"amp","functions":["current-sense"],"pins":{"plus":["IN+","VIN+"],"minus":["IN-","VIN-"]}},
                {"id":"shunt","kind":"shunt","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"plusR","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"minusR","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"amp.plus","to":"plusR.b","local":true},
                {"from":"amp.minus","to":"minusR.b","local":true},
                {"from":"plusR.a","to":"shunt.a","local":true},
                {"from":"minusR.a","to":"shunt.b","local":true},
            ],
        },
        {
            nodes: [
                {"id":"amp","functions":["current-sense"],"pins":{"plus":["IN+","VIN+"],"minus":["IN-","VIN-"]}},
                {"id":"shunt","kind":"shunt","pinCount":4,"pins":{"a":["SENSE+","KELVIN+","S+","VS+"],"b":["SENSE-","KELVIN-","S-","VS-"]}},
                {"id":"plusR","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"minusR","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"amp.plus","to":"plusR.b","local":true},
                {"from":"amp.minus","to":"minusR.b","local":true},
                {"from":"plusR.a","to":"shunt.a","local":true},
                {"from":"minusR.a","to":"shunt.b","local":true},
            ],
        },
    ],
};

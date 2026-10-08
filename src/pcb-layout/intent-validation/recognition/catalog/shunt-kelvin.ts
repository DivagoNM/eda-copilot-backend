import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "shunt-kelvin",
    title: "Current shunt Kelvin sense",
    prerequisites: "Confirmed shunt and sense amplifier",
    nodes: [
        {"id":"amp","functions":["current-sense"],"pins":{"plus":["IN+","VIN+"],"minus":["IN-","VIN-"]}},
        {"id":"shunt","kind":"shunt","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"amp.plus","to":"shunt.a","local":true},
        {"from":"amp.minus","to":"shunt.b","local":true},
    ],
};

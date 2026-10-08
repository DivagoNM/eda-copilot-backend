import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "receiver-termination",
    title: "Receiver parallel termination",
    prerequisites: "Confirmed receiver termination/application endpoint",
    nodes: [
        {"id":"receiver","functions":["receiver-termination"],"pins":{"input":["IN","RX","CLKIN"],"ref":["GND","VTT"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"receiver.input","to":"resistor.a","local":true},
        {"from":"receiver.ref","to":"resistor.b"},
    ],
};

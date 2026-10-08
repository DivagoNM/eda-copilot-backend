import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "receiver-termination",
    title: "Receiver parallel termination",
    nodes: [
        {"id":"receiver","functions":["receiver-termination"],"pins":{"input":["IN","RX","CLKIN"],"ref":["GND","VTT"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"receiver.input","to":"resistor.a","local":true},
        {"from":"receiver.ref","to":"resistor.b"},
    ],
    variants: [
        {
            nodes: [
                {"id":"receiver","functions":["receiver-termination"],"pins":{"plus":["IN+","RX+"],"minus":["IN-","RX-"]}},
                {"id":"resistor","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"receiver.plus","to":"resistor.a","local":true},
                {"from":"receiver.minus","to":"resistor.b","local":true},
            ],
        },
    ],
};

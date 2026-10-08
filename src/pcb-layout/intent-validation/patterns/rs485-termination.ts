import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "rs485-termination",
    title: "RS485 termination",
    nodes: [
        {"id":"rs485","functions":["rs485-endpoint"],"pins":{"a":["A"],"b":["B"]}},
        {"id":"termination","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"rs485.a","to":"termination.a","local":true},
        {"from":"rs485.b","to":"termination.b","local":true},
    ],
};

import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "inductive-clamp",
    title: "Inductive load clamp",
    nodes: [
        {"id":"load","kind":"inductive-load","pins":{"a":["*"],"b":["*"]}},
        {"id":"clamp","kind":"flyback-diode","pins":{"a":["A"],"k":["K"]}},
    ],
    links: [
        {"from":"load.a","to":"clamp.k","local":true},
        {"from":"load.b","to":"clamp.a","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"load","kind":"inductive-load","pins":{"a":["*"],"b":["*"]}},
                {"id":"diode","kind":"tvs","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"load.a","to":"diode.a","local":true},
                {"from":"load.b","to":"diode.b","local":true},
            ],
        },
    ],
};

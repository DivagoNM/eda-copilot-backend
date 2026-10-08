import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "miller-clamp",
    title: "Miller clamp",
    nodes: [
        {"id":"driver","pins":{"clamp":["CLAMP","MCLAMP"]}},
        {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
    ],
    links: [
        {"from":"driver.clamp","to":"switch.g","local":true},
    ],
};

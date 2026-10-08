import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "bootstrap",
    title: "Bootstrap capacitor",
    prerequisites: "Named BOOT/HB and SW/HS",
    nodes: [
        {"id":"driver","pins":{"boot":["BOOT","HB","VB","BST"],"sw":["SW","HS","VS","LX","PH"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"driver.boot","to":"cap.a","local":true},
        {"from":"driver.sw","to":"cap.b","local":true},
    ],
};

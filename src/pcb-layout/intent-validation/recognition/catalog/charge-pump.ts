import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "charge-pump",
    title: "Charge-pump flying capacitor",
    prerequisites: "C+/C- or confirmed flying-cap pins",
    nodes: [
        {"id":"ic","pins":{"plus":["C+","C1+","CAP+"],"minus":["C-","C1-","CAP-"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"ic.plus","to":"cap.a","local":true},
        {"from":"ic.minus","to":"cap.b","local":true},
    ],
};

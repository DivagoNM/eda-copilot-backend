import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "crystal",
    title: "Crystal oscillator",
    nodes: [
        {"id":"ic","pins":{"input":["OSCIN","XTALIN","XIN","XI","OSC32IN"],"output":["OSCOUT","XTALOUT","XOUT","XO","OSC32OUT"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"crystal","kind":"crystal","pins":{"a":["*"],"b":["*"]}},
        {"id":"inputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]},"optional":true},
        {"id":"outputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]},"optional":true},
    ],
    links: [
        {"from":"ic.input","to":"crystal.a","local":true},
        {"from":"ic.output","to":"crystal.b","local":true},
        {"from":"crystal.a","to":"inputCap.a","local":true},
        {"from":"crystal.b","to":"outputCap.a","local":true},
        {"from":"inputCap.b","to":"ic.g"},
        {"from":"outputCap.b","to":"ic.g"},
    ],
};

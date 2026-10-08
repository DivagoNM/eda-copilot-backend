import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "compensation",
    title: "COMP network",
    nodes: [
        {"id":"ic","pins":{"comp":["COMP"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"ic.comp","to":"resistor.a","local":true},
        {"from":"resistor.b","to":"cap.a","local":true},
        {"from":"cap.b","to":"ic.g"},
    ],
    variants: [
        {
            nodes: [
                {"id":"ic","pins":{"comp":["COMP"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
                {"id":"cap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"ic.comp","to":"cap.a","local":true},
                {"from":"cap.b","to":"ic.g","local":true},
            ],
        },
        {
            nodes: [
                {"id":"ic","pins":{"comp":["COMP"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
                {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"ic.comp","to":"cap.a","local":true},
                {"from":"ic.comp","to":"resistor.a","local":true},
                {"from":"cap.b","to":"ic.g","local":true},
                {"from":"resistor.b","to":"ic.g","local":true},
            ],
        },
        {
            nodes: [
                {"id":"ic","pins":{"comp":["COMP"],"g":["FB"]}},
                {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"ic.comp","to":"resistor.a","local":true},
                {"from":"resistor.b","to":"cap.a","local":true},
                {"from":"cap.b","to":"ic.g","local":true},
            ],
        },
        {
            nodes: [
                {"id":"ic","pins":{"comp":["COMP"],"g":["FB"]}},
                {"id":"cap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"ic.comp","to":"cap.a","local":true},
                {"from":"cap.b","to":"ic.g","local":true},
            ],
        },
        {
            nodes: [
                {"id":"ic","pins":{"comp":["COMP"],"g":["REF","VREF"]}},
                {"id":"resistor","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"ic.comp","to":"resistor.a","local":true},
                {"from":"resistor.b","to":"cap.a","local":true},
                {"from":"cap.b","to":"ic.g","local":true},
            ],
        },
        {
            nodes: [
                {"id":"ic","pins":{"comp":["COMP"],"g":["REF","VREF"]}},
                {"id":"cap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"ic.comp","to":"cap.a","local":true},
                {"from":"cap.b","to":"ic.g","local":true},
            ],
        },
    ],
};

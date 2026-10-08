import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "reference-buffer",
    title: "Reference buffer",
    nodes: [
        {"id":"buffer","functions":["reference-buffer"],"pins":{"out":["OUT"],"minus":["IN-"],"plus":["IN+"]}},
        {"id":"adc","functions":["adc"],"pins":{"ref":["REF","VREF","REFIN"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"buffer.out","to":"buffer.minus"},
        {"from":"buffer.out","to":"adc.ref","local":true},
        {"from":"adc.ref","to":"cap.a","local":true},
        {"from":"adc.g","to":"cap.b"},
    ],
    variants: [
        {
            nodes: [
                {"id":"buffer","functions":["reference-buffer"],"pins":{"out":["OUT"],"minus":["IN-"],"plus":["IN+"]}},
                {"id":"adc","functions":["adc"],"pins":{"ref":["REF","VREF","REFIN"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
                {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
                {"id":"feedback","kind":"resistor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"buffer.out","to":"adc.ref","local":true},
                {"from":"adc.ref","to":"cap.a","local":true},
                {"from":"adc.g","to":"cap.b"},
                {"from":"buffer.out","to":"feedback.a","local":true},
                {"from":"buffer.minus","to":"feedback.b","local":true},
            ],
        },
    ],
};

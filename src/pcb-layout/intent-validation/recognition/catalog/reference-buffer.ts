import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "reference-buffer",
    title: "Reference buffer",
    prerequisites: "Confirmed reference buffer and ADC",
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
};

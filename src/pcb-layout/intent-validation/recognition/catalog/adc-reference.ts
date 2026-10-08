import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "adc-reference",
    title: "ADC reference capacitor",
    prerequisites: "Confirmed ADC and REF pin",
    nodes: [
        {"id":"adc","functions":["adc"],"pins":{"ref":["REF","VREF","REFIN"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"adc.ref","to":"cap.a","local":true},
        {"from":"adc.g","to":"cap.b"},
    ],
};

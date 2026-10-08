import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "sar-input-filter",
    title: "SAR ADC input RC",
    prerequisites: "Confirmed SAR/ADC and input pin",
    nodes: [
        {"id":"adc","functions":["adc"],"pins":{"input":["IN","AIN","VIN","ADCIN"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"series","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"adc.input","to":"series.b","local":true},
        {"from":"adc.input","to":"cap.a","local":true},
        {"from":"adc.g","to":"cap.b"},
    ],
};

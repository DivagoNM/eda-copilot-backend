import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "high-impedance-divider",
    title: "High-impedance ADC divider",
    nodes: [
        {"id":"adc","functions":["adc","high-impedance-input"],"pins":{"input":["IN","AIN","VIN","ADCIN"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"upper","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"lower","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"adc.input","to":"upper.b","local":true},
        {"from":"adc.input","to":"lower.a","local":true},
        {"from":"lower.b","to":"adc.g"},
        {"from":"adc.input","to":"cap.a","local":true},
        {"from":"cap.b","to":"adc.g"},
    ],
};

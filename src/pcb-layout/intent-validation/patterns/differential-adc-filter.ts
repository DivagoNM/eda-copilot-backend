import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "differential-adc-filter",
    title: "Differential ADC RC",
    nodes: [
        {"id":"adc","functions":["adc"],"pins":{"plus":["IN+","AIN+","VIN+"],"minus":["IN-","AIN-","VIN-"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"plusR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"minusR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"cap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"adc.plus","to":"plusR.b","local":true},
        {"from":"adc.minus","to":"minusR.b","local":true},
        {"from":"adc.plus","to":"cap.a","local":true},
        {"from":"adc.minus","to":"cap.b","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"adc","functions":["adc"],"pins":{"plus":["IN+","AIN+","VIN+"],"minus":["IN-","AIN-","VIN-"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
                {"id":"plusR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"minusR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
                {"id":"plusCap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"minusCap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"adc.plus","to":"plusR.b","local":true},
                {"from":"adc.minus","to":"minusR.b","local":true},
                {"from":"adc.plus","to":"plusCap.a","local":true},
                {"from":"adc.minus","to":"minusCap.a","local":true},
                {"from":"adc.g","to":"plusCap.b","local":true},
                {"from":"adc.g","to":"minusCap.b","local":true},
            ],
        },
    ],
};

import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "usb-series-pair",
    title: "USB 2 series resistors",
    nodes: [
        {"id":"phy","functions":["usb-series-required"],"pins":{"plus":["DP","D+"],"minus":["DM","D-"]}},
        {"id":"plusR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
        {"id":"minusR","kind":"resistor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"phy.plus","to":"plusR.a","local":true},
        {"from":"phy.minus","to":"minusR.a","local":true},
    ],
};

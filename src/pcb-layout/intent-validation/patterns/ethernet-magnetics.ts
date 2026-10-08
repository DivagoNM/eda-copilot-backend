import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "ethernet-magnetics",
    title: "Ethernet magnetics",
    nodes: [
        {"id":"phy","functions":["ethernet-phy"],"pins":{"plus":["TX+","TD+"],"minus":["TX-","TD-"]}},
        {"id":"magnetics","kind":"ethernet-magnetics","pins":{"phyP":["PHY+","PRI+"],"phyN":["PHY-","PRI-"],"lineP":["LINE+","SEC+"],"lineN":["LINE-","SEC-"]}},
        {"id":"connector","kind":"connector","pins":{"plus":["*"],"minus":["*"]}},
    ],
    links: [
        {"from":"phy.plus","to":"magnetics.phyP","local":true},
        {"from":"phy.minus","to":"magnetics.phyN","local":true},
        {"from":"magnetics.lineP","to":"connector.plus","local":true},
        {"from":"magnetics.lineN","to":"connector.minus","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"phy","functions":["ethernet-phy"],"pins":{"plus":["TX+","TD+"],"minus":["TX-","TD-"]}},
                {"id":"magnetics","kind":"ethernet-magnetics","pins":{"phyP":["PHY+","PRI+"],"phyN":["PHY-","PRI-"],"lineP":["LINE+","SEC+"],"lineN":["LINE-","SEC-"],"phyCT":["PHYCT","PRICT"]}},
                {"id":"connector","kind":"connector","pins":{"plus":["*"],"minus":["*"]}},
                {"id":"phyCap","kind":"capacitor","pinCount":2,"functions":["ethernet-center-tap-cap"],"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"phy.plus","to":"magnetics.phyP","local":true},
                {"from":"phy.minus","to":"magnetics.phyN","local":true},
                {"from":"magnetics.lineP","to":"connector.plus","local":true},
                {"from":"magnetics.lineN","to":"connector.minus","local":true},
                {"from":"magnetics.phyCT","to":"phyCap.a","local":true},
            ],
        },
        {
            nodes: [
                {"id":"phy","functions":["ethernet-phy"],"pins":{"plus":["TX+","TD+"],"minus":["TX-","TD-"]}},
                {"id":"magnetics","kind":"ethernet-magnetics","pins":{"phyP":["PHY+","PRI+"],"phyN":["PHY-","PRI-"],"lineP":["LINE+","SEC+"],"lineN":["LINE-","SEC-"],"lineCT":["LINECT","SECCT"]}},
                {"id":"connector","kind":"connector","pins":{"plus":["*"],"minus":["*"]}},
                {"id":"lineResistor","kind":"resistor","pinCount":2,"functions":["ethernet-line-termination"],"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"phy.plus","to":"magnetics.phyP","local":true},
                {"from":"phy.minus","to":"magnetics.phyN","local":true},
                {"from":"magnetics.lineP","to":"connector.plus","local":true},
                {"from":"magnetics.lineN","to":"connector.minus","local":true},
                {"from":"magnetics.lineCT","to":"lineResistor.a","local":true},
            ],
        },
        {
            nodes: [
                {"id":"phy","functions":["ethernet-phy"],"pins":{"plus":["TX+","TD+"],"minus":["TX-","TD-"]}},
                {"id":"magjack","kind":"magjack","pins":{"phyP":["PHY+","PRI+"],"phyN":["PHY-","PRI-"]}},
            ],
            links: [
                {"from":"phy.plus","to":"magjack.phyP","local":true},
                {"from":"phy.minus","to":"magjack.phyN","local":true},
            ],
        },
        {
            nodes: [
                {"id":"phy","functions":["ethernet-phy"],"pins":{"plus":["TX+","TD+"],"minus":["TX-","TD-"]}},
                {"id":"magjack","kind":"magjack","pins":{"phyP":["PHY+","PRI+"],"phyN":["PHY-","PRI-"],"phyCT":["PHYCT","PRICT"]}},
                {"id":"phyCap","kind":"capacitor","pinCount":2,"functions":["ethernet-center-tap-cap"],"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"phy.plus","to":"magjack.phyP","local":true},
                {"from":"phy.minus","to":"magjack.phyN","local":true},
                {"from":"magjack.phyCT","to":"phyCap.a","local":true},
            ],
        },
        {
            nodes: [
                {"id":"phy","functions":["ethernet-phy"],"pins":{"plus":["TX+","TD+"],"minus":["TX-","TD-"]}},
                {"id":"magnetics","kind":"ethernet-magnetics","pins":{"phyP":["PHY+","PRI+"],"phyN":["PHY-","PRI-"],"lineP":["LINE+","SEC+"],"lineN":["LINE-","SEC-"],"lineCT":["LINECT","SECCT"]}},
                {"id":"connector","kind":"connector","pins":{"plus":["*"],"minus":["*"]}},
                {"id":"lineResistor","kind":"resistor","pinCount":2,"functions":["ethernet-line-termination"],"pins":{"a":["*"],"b":["*"]}},
                {"id":"chassisCap","kind":"capacitor","pinCount":2,"functions":["ethernet-chassis-cap"],"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"phy.plus","to":"magnetics.phyP","local":true},
                {"from":"phy.minus","to":"magnetics.phyN","local":true},
                {"from":"magnetics.lineP","to":"connector.plus","local":true},
                {"from":"magnetics.lineN","to":"connector.minus","local":true},
                {"from":"magnetics.lineCT","to":"lineResistor.a","local":true},
                {"from":"lineResistor.b","to":"chassisCap.a","local":true},
            ],
        },
    ],
};

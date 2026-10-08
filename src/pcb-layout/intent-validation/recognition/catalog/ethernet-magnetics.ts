import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "ethernet-magnetics",
    title: "Ethernet magnetics",
    prerequisites: "Confirmed PHY/magnetics; integrated MagJack profile",
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
};

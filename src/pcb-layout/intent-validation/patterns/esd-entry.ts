import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "esd-entry",
    title: "Connector ESD protection",
    nodes: [
        {"id":"connector","kind":"connector","pins":{"signal":["*"]}},
        {"id":"tvs","kind":"esd","withoutFunctions":["ethernet-protection"],"pins":{"signal":["IO","LINE"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
    ],
    links: [
        {"from":"connector.signal","to":"tvs.signal","local":true},
    ],
};

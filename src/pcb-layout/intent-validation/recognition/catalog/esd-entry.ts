import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "esd-entry",
    title: "Connector ESD protection",
    prerequisites: "Confirmed ESD protection; Ethernet excluded by profile",
    nodes: [
        {"id":"connector","kind":"connector","pins":{"signal":["*"]}},
        {"id":"tvs","kind":"esd","pins":{"signal":["IO","LINE"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
    ],
    links: [
        {"from":"connector.signal","to":"tvs.signal","local":true},
    ],
};

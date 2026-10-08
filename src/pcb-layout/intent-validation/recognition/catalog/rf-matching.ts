import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "rf-matching",
    title: "RF matching network",
    prerequisites: "Confirmed RF matching function",
    nodes: [
        {"id":"rf","functions":["rf-matching"],"pins":{"rf":["RF","RFOUT","RFIN"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
        {"id":"series","functions":["rf-series"],"pins":{"a":["*"],"b":["*"]}},
        {"id":"shunt","functions":["rf-shunt"],"pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"rf.rf","to":"series.a","local":true},
        {"from":"series.b","to":"shunt.a","local":true},
        {"from":"shunt.b","to":"rf.g"},
    ],
    variants: [
        {
            nodes: [
                {"id":"rf","functions":["rf-matching"],"pins":{"rf":["RF","RFOUT","RFIN"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
                {"id":"series","functions":["rf-series"],"pins":{"a":["*"],"b":["*"]},"pinCount":2},
                {"id":"shunt","functions":["rf-shunt"],"pins":{"a":["*"],"b":["*"]},"pinCount":2},
                {"id":"inputShunt","functions":["rf-shunt"],"pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"rf.rf","to":"series.a","local":true},
                {"from":"series.b","to":"shunt.a","local":true},
                {"from":"shunt.b","to":"rf.g"},
                {"from":"rf.rf","to":"inputShunt.a","local":true},
                {"from":"inputShunt.b","to":"rf.g"},
            ],
        },
        {
            nodes: [
                {"id":"rf","functions":["rf-matching"],"pins":{"rf":["RF","RFOUT","RFIN"],"g":["GND","VSS","AGND","PGND","DGND","VEE"]}},
                {"id":"series","functions":["rf-series"],"pins":{"a":["*"],"b":["*"]},"pinCount":2},
                {"id":"shunt","functions":["rf-shunt"],"pins":{"a":["*"],"b":["*"]},"pinCount":2},
                {"id":"outputSeries","functions":["rf-series"],"pinCount":2,"pins":{"a":["*"],"b":["*"]}},
            ],
            links: [
                {"from":"rf.rf","to":"series.a","local":true},
                {"from":"series.b","to":"shunt.a","local":true},
                {"from":"shunt.b","to":"rf.g"},
                {"from":"series.b","to":"outputSeries.a","local":true},
            ],
        },
    ],
};

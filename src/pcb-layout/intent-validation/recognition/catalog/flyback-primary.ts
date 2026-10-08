import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "flyback-primary",
    title: "Flyback primary",
    prerequisites: "Confirmed transformer winding roles and flyback primary",
    placementPurposes: ['quiet-controller'],
    placementFunctions: ['flyback-controller'],
    nodes: [
        {"id":"winding","kind":"transformer","pins":{"a":["PRI+","PRIMARY+"],"b":["PRI-","PRIMARY-"]}},
        {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
        {"id":"inputCap","kind":"capacitor","pins":{"a":["*"],"b":["*"]}},
    ],
    links: [
        {"from":"winding.a","to":"inputCap.a","local":true},
        {"from":"winding.b","to":"switch.d","local":true},
        {"from":"switch.s","to":"inputCap.b","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"winding","kind":"transformer","pins":{"a":["PRI+","PRIMARY+"],"b":["PRI-","PRIMARY-"]}},
                {"id":"switch","kind":"mosfet","pins":{"g":["G","GATE"],"s":["S","SOURCE"],"d":["D","DRAIN"]}},
                {"id":"inputCap","kind":"capacitor","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"shunt","kind":"shunt","pinCount":2,"pins":{"a":["*"],"b":["*"]}},
                {"id":"controller","functions":["flyback-controller"],"pins":{"sense":["CS","ISENSE"],"g":["GND","VSS","PGND"]}},
            ],
            links: [
                {"from":"winding.a","to":"inputCap.a","local":true},
                {"from":"winding.b","to":"switch.d","local":true},
                {"from":"switch.s","to":"shunt.a","local":true},
                {"from":"shunt.b","to":"inputCap.b","local":true},
                {"from":"controller.sense","to":"shunt.a","local":true},
                {"from":"controller.g","to":"inputCap.b"},
            ],
        },
    ],
};

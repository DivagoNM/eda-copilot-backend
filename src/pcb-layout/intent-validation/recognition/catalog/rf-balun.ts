import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "rf-balun",
    title: "RF balun",
    prerequisites: "Confirmed balun and RF pin roles",
    nodes: [
        {"id":"rf","functions":["rf"],"pins":{"plus":["RF+","RFP"],"minus":["RF-","RFN"]}},
        {"id":"balun","kind":"balun","pins":{"plus":["IN+","DIFF+"],"minus":["IN-","DIFF-"],"single":["OUT","SINGLE"]}},
    ],
    links: [
        {"from":"rf.plus","to":"balun.plus","local":true},
        {"from":"rf.minus","to":"balun.minus","local":true},
    ],
    variants: [
        {
            nodes: [
                {"id":"rf","functions":["rf"],"pins":{"plus":["RF+","RFP"],"minus":["RF-","RFN"]}},
                {"id":"balun","kind":"balun","pins":{"plus":["IN+","DIFF+"],"minus":["IN-","DIFF-"],"single":["OUT","SINGLE"]}},
                {"id":"endpoint","functions":["rf-endpoint"],"pins":{"rf":["RF","FEED"]}},
            ],
            links: [
                {"from":"rf.plus","to":"balun.plus","local":true},
                {"from":"rf.minus","to":"balun.minus","local":true},
                {"from":"balun.single","to":"endpoint.rf","local":true},
            ],
        },
    ],
};

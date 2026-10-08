import type { CircuitPatternDefinition } from '../types.ts';

export const pattern: CircuitPatternDefinition = {
    id: "qspi-flash",
    title: "QSPI/OSPI flash",
    prerequisites: "Confirmed memory interface/profile",
    nodes: [
        {"id":"host","functions":["qspi-host"],"pins":{"clk":["CLK","SCK","QSPI.CK"]}},
        {"id":"flash","functions":["qspi-flash"],"pins":{"clk":["CLK","SCK"]}},
    ],
    links: [
        {"from":"host.clk","to":"flash.clk","local":true},
    ],
};

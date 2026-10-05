# ESP32_C3_MAN

Exported through EasyEDA CoPilot on 2026-10-05 from project `ceb72d3c1e7045ef9f8b878bb2d40e23`, Board1 / PCB1 (`9b3d96f0cec2cf26`).
107 components from MCU_USB, CAN, RS485, POWER and FIELD_IO. The unrelated Schematic2 is excluded.

- `ESP32_C3_MAN.json`: complete linked schematic, including device UUIDs, footprint references and original nets.
- `source-pcb-overview.json`: live PCB overview (native mm frame), including component sides and copper summary.
- `source-pcb.txt`: native PCB File Source snapshot, including original poses and copper.
- `ESP32_C3_MAN.js`: functional placement DSL; all components are assigned exactly once.
- `ESP32_C3_MAN.ts`: validation and placement runner, using the shared fixture helper.

The native PCB source contains no outline primitives. This revised fixture authors a 120 x 85 mm rounded board with four 3.2 mm mounting holes, 6 mm from the corners. The outline and all external interfaces are mechanically defined; supporting electrical components remain movable. The original nets are retained, including unexpected USB-to-GND assignments and CAN ground connections.

| Interface | Locked placement |
| --- | --- |
| J1 supply | Left edge, y = 12 mm, outward |
| J2 USB-C | Bottom edge, x = -42 mm, 0.5 mm body overhang |
| J3 external I2C | x = -56.5, y = -18 mm, rotation 90 degrees; 0.6 mm body-to-edge margin |
| J4 field inputs | Top edge, x = -27 mm, outward |
| J5 field outputs | Top edge, x = 20 mm, outward |
| J8 CAN | Right edge, y = -19 mm, outward |
| J6 RS485 | Right edge, y = 12 mm, outward |
| J9 CAN termination | x = 40, y = -19 mm, rotation 270 degrees |
| J7 RS485 termination | x = 40, y = 12 mm, rotation 270 degrees |
| SW1 / SW2 | x = 20 / 34, y = 34 mm |
| LED1 | x = 44, y = 34 mm |
| U3 ESP antenna | Bottom edge, x = -6 mm, rotation 0; unpadded antenna tail extends 6 mm |

J7/J9 are the source project's right-angle 2.54 mm two-pin headers. Fitting a removable shunt enables the corresponding 120-ohm termination. They point inward and have reserved 8 x 6 mm shunt-access areas in front of their tips. J3 is accessed from above at the left edge.

U17/U14 are movable members of the CAN/RS485 connector blocks, with hard 5 mm limits to the first bus pad. Transceivers and their supply converters remain separate functional blocks so a rigid module envelope cannot push port protection into the middle of the board.

The two-layer routing plan uses top components/signals and mostly continuous bottom reference copper, with separate field and bus return domains. Keep power and signal escapes open; do not bridge isolated returns. Antenna component exclusions do not create copper keepouts. Copper exclusion beneath the antenna tail, return planes, conductor sizing and full routing remain later-stage work.

The buck uses a hard 5 mm SW-to-inductor limit, a compact switch island, bootstrap/feedback/compensation hints and capacitor banks. Its real grounded PowerPAD (U1.9) receives calculated thermal via geometry with a provisional 1 W dissipation / 35 C rise budget and a 16 x 16 mm copper-spreading limit. D1/D3/D4/D5 require copper spreading during routing; U2 and U11 use lead/ground copper. Signal/ESD parts need no synthetic exposed-pad geometry.

Placement guidance was checked against [TI TPS54360, layout p.38 and DDA thermal data p.5](https://www.ti.com/lit/ds/symlink/tps54360.pdf) and [Espressif module placement guidance](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c3/pcb-layout-design.html#general-principles-of-pcb-layout-for-modules-positioning-a-module-on-a-base-board). TI specifies grounded PowerPAD vias and short bypass/diode/switch loops; DDA thetaJC-bottom is 3.6 C/W. The dissipation budget is an authored assumption, not a load measurement.

Run from the backend root:

```sh
node --import tsx tests/pcb-layout/ESP32_C3_MAN/ESP32_C3_MAN.ts --validate
npm run test:pcb-layout -- ESP32_C3_MAN
```

Validation checks component count, UUID/footprint presence, complete block ownership, local-layout metadata and same-net critical pairs/paths. Full placement uses the current local backend source and native addon directly. The runner requires clean placement geometry, unchanged mechanical coordinates/rotations, all 107 components on top, valid graph ownership and no hard switch-node or connector-TVS distance violations. Inspect generated artifacts under `debugging/pcb-layout/ESP32_C3_MAN`.

The revised mechanics passed focused placement on 2026-10-05 using the current local backend: 13 mechanical components, no geometry errors, locked edges and supported antenna pads. The previous 116.386 x 80.266 mm automatic-layout result is superseded and does not validate this revision.

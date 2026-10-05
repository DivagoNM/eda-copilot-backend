# Portable AC DC Voltage Current Telemetry

Exported through EasyEDA CoPilot on 2026-10-05 from project `fabf3342a8784bdcb4b47995fc42f71c`, Board1 / PCB1 (`efd79daaba344398`).
154 components from InputCharger, VoltageCurrent, ADC, P1, BatteryUSB, ControllerWiFi, Cellular and ReverseInputCharger.

- `Portable_AC_DC_Telemetry.json`: complete eight-page schematic with original nets and resolved device/footprint references.
- `placement-reference.json`: checked, manually refined result in normalized mm, with provenance; not a successful automatic solver result.
- `source-pcb.txt`: native EasyEDA PCB File Source snapshot, including original geometry, component poses and copper.
- `Portable_AC_DC_Telemetry.js`: functional placement DSL; all components are assigned exactly once.
- `Portable_AC_DC_Telemetry.ts`: validation and placement runner, using the shared fixture helper.

The two-layer polygon is 100 x 100 mm with the source's 50 x 7 mm notch retained. Outline values are converted from native mil to mm and rounded to the authored dimensions. The revised DSL intentionally regenerates placement on top with locked source-facing mechanics. It does not apply changes in EasyEDA. Positive and negative input-harvesting chains and their separate return nets are retained.

| Interface | Locked mechanics, mm |
| --- | --- |
| J1 voltage / J2 current | Right edge, y=-17.5 / -32, outward, rotation 90 |
| J5 USB | Left edge, y=16, 0.5 mm overhang |
| J6 battery | Top edge, x=13.5, outward |
| J7 battery NTC | (-44,-3), rotation 90, vertical plug access |
| J3 hinged microSIM | (26,36), rotation 0, top access |
| J4 U.FL | (46,14), rotation 270, 5 x 5 mm top plug-access exclusion |
| SW1 / SW2 | (-29,35) / (5,35), top access |
| U5 ESP32-S3 | (-11,36.25), rotation 0, antenna tail inside the source notch |

The ESP footprint's pads end at y=42.4113, leaving 0.5887 mm to the notch edge at y=43. Its unpadded body ends at y=49.4519. A fixed notch-relative coordinate is used because edgeMount resolves against the polygon's outer bounding box. KF301 opening direction is explicitly top at zero rotation, correcting the pad-asymmetry heuristic.

44 functional blocks cover every component exactly once. Twelve ordered paths include the voltage divider, both shunt Kelvin branches, differential ADC inputs, USB and SIM. Four switch/inductor islands have explicit hard distances; local power, feedback and analog support are attached to their ICs. Bottom copper is planned as separate reference domains; Kelvin connections, isolation barriers, antenna copper exclusions and sized high-current traces remain routing work. The placement fixture does not establish high-voltage creepage or certify isolation.

The revised functional floorplan reserves x=0..50, y=-50..-3 for measurement blocks, their local supply switch and the fixed battery connector. Switching, charging and RF blocks are excluded. The reciprocal upper-left area is reserved for harvesting and battery/USB power, excluding analog and modem blocks. Harvesting converters are attracted toward the upper left rather than J1; the ADC follows U1/U2 outputs rather than the MCU or a board corner. The modem prefers the lower-right area and allows rotation 270 so its RF pad faces J4. These are block exclusions and soft attractions, not fixed electrical coordinates.

The U6.60-to-J4.2 RF feed has a hard 8 mm pad-distance limit and facing-pad preference. A merely critical soft hint previously allowed a 27.37 mm feed from the wrong side of the module. The fixture checks this bound alongside the switching islands.

Real grounded exposed pads U11.17, U12.11, U13.17 and U17.17 receive thermal via geometry. Provisional loss budgets are 1 W for the USB charger, 0.5 W for the system converter and 0.25 W for each harvesting converter. U10 uses its HR-package ground/power lands; no synthetic exposed pad is invented. R6, R38/R44, D1/D2, isolated supply modules, LDOs and wafer chargers require copper spreading during routing. Logic and small control transistors need local returns rather than added exposed-pad primitives.

Sources: [BQ24074 layout pp.40–42, thermal p.11](https://www.ti.com/lit/ds/symlink/bq24074.pdf), [TPS63031 layout p.17, thermal p.4](https://www.ti.com/lit/ds/symlink/tps63031.pdf), [LTC3639 exposed pad p.2 and layout p.19](https://www.analog.com/media/en/technical-documentation/data-sheets/ltc3639.pdf), [TPS63070](https://www.ti.com/lit/ds/symlink/tps63070.pdf), [Espressif ESP32-S3 placement](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32s3/pcb-layout-design.html).

Run from the backend root:

```sh
node --import tsx tests/pcb-layout/Portable_AC_DC_Telemetry/Portable_AC_DC_Telemetry.ts --validate
npm run test:pcb-layout -- Portable_AC_DC_Telemetry
```

Validation checks the source polygon, locked mechanics, component count, device UUID presence, complete block ownership, block size and same-net critical pairs/paths. The source omits footprint metadata for U5, U14, U18 and J4; their original device UUIDs are retained for runtime resolution. Full placement runs the current local source and native addon through the fixture helper. The runner requires all 154 components, clean geometry, exact mechanical poses, valid graph ownership and no hard switch-loop or RF-feed distance violations. Inspect artifacts under `debugging/pcb-layout/Portable_AC_DC_Telemetry`.

The initial 33-block / 9-path version reached board placement but exceeded the shared runner's 600-second timeout. This revision supersedes that input. On 2026-10-05 the live netlist matched the saved export; offline validation and the 10-component mechanical preview passed. The revised automatic passes completed but failed strict acceptance; see the evidence below.

## Floorplan correction result

The user-rejected baseline mixed harvesting converters with measurement inputs on the right. The revised layout moves U13/L3 and U17/L4 to the left and keeps U1/U2/U4 on the right. USB/system power stays left of the LTE section. Connector/button/ESP mechanics and the source netlist remain unchanged.

Two completed local native floorplan passes and one scoped RF refinement failed acceptance: U6 or C28 entered the quiet region, and the hard 8 mm RF limit was exceeded (27.37 mm, then 11.97 mm). The scoped run also logged a compact_candidates assertion and continued through fallback. No solver code or scoring weights were changed.

After the solver stalled, explicit manual RF-group correction produced the saved reference. The current backend independently rebuilt real footprint geometry and reported clean geometry, graph ownership and all hard distances for its 154 top components; the fixture also checked the ten fixed mechanical poses. RF U6.60-to-J4.2 is approximately 7.0 mm. DSL validation, --validate-reference and TypeScript checks passed. The default fixture still exercises the automatic solver and retains its strict acceptance assertions; the latest rotation-constrained DSL has not received a new complete automatic run.

Preview: debugging/pcb-layout/Portable_AC_DC_Telemetry-v2/repaired/placement.png. Reports and failed logs are under the same ignored v2 directory and debugging/pcb-layout/Portable_AC_DC_Telemetry. This is a placement reference, not a routed or fabricated board. For investigation and reproducibility see docs/experimental/pcb/Portable_AC_DC_Telemetry-mechanics/README.md.

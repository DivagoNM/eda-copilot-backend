# STM32G0 CAN RS485 Controller 60x40

Exported from the connected EasyEDA project on 2026-10-03:

- Project: `STM32G0 CAN RS485 Controller 60x40` (`96d4453b7c2146a18b64b7d70910a28c`).
- Board1 / Schematic1 (`bbde63a05e14b968`), pages Interfaces, MCU and Power.
- PCB1 (`b988759eb94f13da`), 60 x 40 mm outline.
- 68 physical components; `STM32G0_CAN_RS485.json` is the complete Copilot schematic export with device UUIDs, footprint names and pin nets. JSON formatting is the only normalization.

The placement DSL covers protected input power, the asynchronous 5 V buck and feedback, 3.3 V LDO, MCU supply/reference, active 8 MHz oscillator with local bypass and series resistor, reset/SWD/user controls, LEDs, CAN and RS485 transceivers, separate supply bypass, connector-side ESD and selectable termination. All components are on top; both copper layers remain available. Ports retain the source board's edge assignments and may slide along those edges. Existing component poses and routed copper are not inputs to this fresh placement fixture.

The 5 mm U1.SW-to-L1 pad distance is hard. Other electrical distance goals are soft and remain visible in the placement report. These are placement rules, including 0.35 mm body clearance and 0.5 mm board edge clearance; they do not configure native EasyEDA copper DRC, create routing or establish impedance compliance.

From the backend root, validate the DSL, complete block ownership, resolved part references and electrical pin/net pairs without resolving footprints or running placement:

```powershell
node --import tsx tests/pcb-layout/STM32G0_CAN_RS485/STM32G0_CAN_RS485.ts --validate
```

Run the board through the usual fixture selector:

```powershell
npm run test:pcb-layout -- STM32G0_CAN_RS485
```

The runner asserts all 68 placements, board dimensions, top-side assembly, geometry/layer checks, ownership graph validity and the hard switch-node limit. It writes the preview, reports and board assembly under `debugging/pcb-layout/STM32G0_CAN_RS485/` and does not apply anything to EasyEDA.

Verified on 2026-10-03 with the repository's current native addon: static validation, TypeScript including this runner, all ten placement-validation unit tests and the complete fixture run passed. The final run placed 68/68 components with no overlaps, board-edge violations, layer violations, unattached passive blocks or hard hint violations. Twelve soft hint violations and automatic terminal-block face warnings remain in the generated report; this fixture does not claim finished routing or fully satisfied soft electrical goals.

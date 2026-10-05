# STEPPER_CONTROLLER — NEMA 17 placement fixture

Revised on 2026-10-05 using EasyEDA CoPilot reads and the current local backend.
The original 85-component netlist is unchanged. Live schematic pin/net lists matched
all saved components; library footprint names/metadata differ from the older export.
Project: b61008d1318a445eb709a9e25738154d. Linked PCB:
b74ae77d4f744a42a5aa0201819c0d34. Read-only comparison PCB: b2764fbf14f709e5.
No placement was assembled in either live PCB.

## Mechanics

The user authorized moving all interfaces and modest height-only growth, with the
motor mounting surface on TOP as the sole required construction constraint.
Width remains 45 mm; height is 66 mm versus the initial 60 mm. Rounded corners R2.
The authored fixture retains its 31 x 31 mm screw pattern centered at (0,11.8):
SCREW1/2=(-15.5,-3.7)/(15.5,-3.7), SCREW3/4=(-15.5,27.3)/(15.5,27.3).
Resolved screw footprints already provide 3.2004 mm drills; no duplicate holes.

- `NEMA17_top_face`: 42.3 x 42.3 mm centered on the pattern, TOP only.
  TOP electrical bodies and protruding pins may not intersect it. The user
  explicitly permits flush USB retention tabs beneath the motor. Only the three
  bottom USB blocks have this region exception; their pad geometry is preserved.
- Four `SCREW*_tool_access` regions: 8 x 8 mm each, BOTH sides; only screw
  footprints are allowed. They reserve head/washer/tool clearance independently
  of the smaller hole footprint.
- AS5600 U1: bottom, (0,11.8), aligned to the motor axis. This is a genuine
  mechanical datum, replacing the original loose bottom-left attraction.
- DD1 socketed TMC2209 module, U7 motor header and J1 diagnostic header: top,
  above the motor face. DD1 and U7 retain the checked mechanical-preview poses
  (-4.563,-23,90) and (14,-28.952,0); the module and connector cannot overlap. J1 is an internal vertical header at (7,-12).
- USB2 power: bottom left, y=-23. USB1 data: bottom left, y=6.
  USB3 UART: bottom right, y=6. USB protrusion 0.5 mm, mating openings outward.
  Data/UART ports now occupy the bottom side below the motor, freeing the upper
  extension. All USB solder/retention pads remain supported by the PCB and clear
  of the four screw-access regions; actual pads still participate in collisions.
- CN1 encoder port: bottom right, y=17. Reset button: bottom left, y=19.
  Boot button: bottom right, y=-11, clearing the UART/encoder connector corridor.
- U4 ESP32-C3: bottom at (0,24.25), rotation 0, fully within the outer board
  envelope. A 15.4 x 5.5 mm open notch (x=-7.7..7.7, y=27.5..33) removes PCB
  under the antenna. All actual pads remain supported; last pad ends at y=26.8499,
  leaving 0.6501 mm to the notch root. The tail has a two-sided placement exclusion.

Motor face size is provisional from the NEMA 17 drawing below; exact motor housing,
shaft/magnet and standoff height are not supplied. This is a motor attached on top
with a magnet aligned to the bottom-side AS5600 through the PCB, not a shaft passing
through a new central hole. Insulating standoffs and actual magnet/PCB/package gap
must be resolved for the chosen assembly. The board does not define a shaft bore.

## Electrical and thermal intent

32 blocks (all below 12 components) own all 85 parts exactly once. Ten ordered paths
cover four motor phases, both USB differential legs, STEP/DIR and driver serial links.
The four status LED/resistor pairs are board-level functional blocks with external
near relations to their driver/MCU pins, allowing Board Package to relocate them
independently of the fixed mechanical families.
The series pair is an intentionally disconnected same-role satellite of the MCU.
R40/R41 belong to the DD1 serial stage, rather than USB3, according to actual nets.
C1 serves AS5600; C26 serves DD1 logic. Buck input/output, feedback, bootstrap,
MCU reset/boot and supplies remain attached to the appropriate pins.

The buck switch/bootstrap island and ideal-diode gate island have explicit hard
3 mm / 4 mm limits. Motor clamps are paired per phase on BOTTOM near U7, rather than packed
as one loose diode collection. Two copper layers are provisional: short local
loops on the component side, continuous GND return wherever possible and broad
20 V/phase conductors separated from the centered sensor. No routing is applied.

DD1 is a complete socketed driver module, not a bare TMC2209 IC. Its heatsink belongs
in the clear upper area; no imaginary exposed-pad primitive is added. TPS54202
U10, inductor U11 and AO3400A Q2 need lead copper/via spreading during routing.
CH224K U9 is a low-power negotiation controller: its real grounded EP needs a local
return, not a fabricated high-power thermal budget. Clamp diodes and zero-ohm power
links also need suitably sized copper. AS5600, LEDs and logic need local return paths.

Layout references: [NEMA 17 mechanical drawings](https://www.ato.com/Content/doc/nema-17-stepper-motor-specs.pdf),
[TPS54202 layout, pp.20–21](https://www.ti.com/lit/gpn/tps54202),
[AS5600 application geometry, pp.33–34](https://look.ams-osram.com/m/7059eac7531a86fd/original/AS5600-DS000365.pdf),
[ESP32-C3 module placement](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c3/pcb-layout-design.html).

## Checks

Run from the backend root:

```sh
node --import tsx tests/pcb-layout/STEPPER_CONTROLLER/STEPPER_CONTROLLER.ts --validate
node --import tsx tests/pcb-layout/STEPPER_CONTROLLER/STEPPER_CONTROLLER.ts --verify-reference
node --import tsx tests/pcb-layout/STEPPER_CONTROLLER/STEPPER_CONTROLLER.ts
npm run typecheck
```

The full fixture uses the local source/native addon and requires 85 unique parts,
clean geometry, graph ownership, both hard islands, preserved hole/axis datums,
no TOP body in the motor face and no through-hole pad protruding under the motor.
Flush USB tabs are the explicit user-authorized exception to the motor-face test;
they are not exempt from electrical collisions, pad-support or screw-access tests.
Current automatic artifacts: debugging/pcb-layout/STEPPER_CONTROLLER-v3/automatic. Evidence and rejected
mechanical trials: debugging/pcb-layout/STEPPER_CONTROLLER-v2 and
 docs/experimental/pcb/STEPPER_CONTROLLER-mechanics/README.md.

## Earlier v2 result and solver limits

The earlier v2 `placement-reference.json` stored the manually refined placement and its
provenance. `--verify-reference` resolves actual footprints with the current backend
and verifies this reference; the normal command still exercises automatic search
with strict acceptance assertions. `--verify-output` similarly checks the raw saved
automatic output under debugging. These modes are not interchangeable.

Both automatic full runs completed but failed geometry acceptance. Locking the
checked DD1/U7 mechanics and moving clamp diodes to bottom removed the large top
collisions. The second result still overlapped status pairs with USB/clamp parts and
violated one 3 mm bootstrap bound. Its native block stage also logged
compact_candidates.rs bounds assertions and continued through fallback. The solver
was not patched and no hard distance was relaxed.

Focused correction arranged four LED/resistor pairs in a bottom-side column, moved
C37 adjacent to BOOT/SW, shifted R13 clear of that capacitor and moved D40 by 0.27 mm
to satisfy the independent screw-access check. The user then requested an antenna
notch without protrusion: U4 moved 5.95 mm inward and nearby boot/supply/reset/pullup
parts moved clear. No other mechanical datum changed. 17 designators differ from
the second raw automatic run.

The final reference passed: all 85 parts present; graph ownership valid; no overlaps,
outside-board/region violations or hard-distance violations; actual TOP bodies and
through-hole projections clear of the motor; both sides clear of screw-access boxes;
ESP inside outer bounds and every solder pad supported at the notch with required
edge margin. DSL validation, --verify-reference, typecheck and diff checks passed.

Final top/bottom component previews and full geometry reports:
`debugging/pcb-layout/STEPPER_CONTROLLER-v2/repaired/`. `sides.png` shows components
mounted on each face; the full placement.svg also shows opposite-side through-hole
occupancy. Before the USB revision, that notched DSL had no new complete automatic run.

## Current USB revision and checked reference

The 2026-10-05 v3 run uses the current local backend/native addon, all 85 components,
the unchanged 45 x 66 mm notched outline and the revised connector mechanics.
It completed in 152.047 s. Automatic geometry passes: zero overlaps, outside-board
parts and region violations. This removes the prior eight inter-family collisions.
The saved raw run still violates U10.2-C37.2 (4.37 mm versus 3 mm). Three bounded
compact GPU block searches also panicked and used the existing CPU fallback.

The current `placement-reference.json` records six scoped manual corrections:
C37 plus LED2 move to close the bootstrap loop without collisions; C21/C24/C32
move upward together by 0.25 mm and R4 moves left by 0.35 mm to provide the
independent screw-access margin. All other 79 positions come from the full run.
Its provenance explicitly identifies these edits and the automatic run time.

Current checks pass: 85 unique parts, graph ownership, zero overlaps/outside/regions,
all hard electrical distances, TOP motor body/pin exclusion (flush USB exception),
two-sided screw access, supported USB pads and supported ESP pads at the notch.
No live EasyEDA assembly or routing was performed; no solver code/weights changed.
The normal automatic fixture remains strict and exposes the bootstrap defect.

Raw input, exact native captures and automatic stages:
`debugging/pcb-layout/STEPPER_CONTROLLER-v3/native-capture/`.
Checked final previews/report: `debugging/pcb-layout/STEPPER_CONTROLLER-v3/repaired/`.
The prior automatic artifacts/reference are retained in v3 `previous-automatic/`
and `previous-reference.json` for comparison.

# STEPPER_CONTROLLER motor mounting placement experiment

2026-10-05. User authorizes general interface relocation and a modest height-only
increase, but requires a free TOP motor face and accessible four NEMA 17 screws.
The existing fixture incorrectly describes bottom-side motor mounting and has no
motor-face exclusion. The captured baseline (2026-10-05T12-01-38-152Z) completed in
119.09 s but placementOk=false. It is not a passing baseline.

Current backend HEAD: a1c57a2e86b18f55ea3a6a37f49e7f38789d354a.
Native win32-x64 SHA256:
49140DE6A710A10B66117560E6E88A5CCAF538845D730D4A95F1CF0B70211E9E.
No production solver code, weights or budgets changed. Uses default native backend
selection; CUDA runtime reports NVIDIA GeForce RTX 3060 Laptop GPU.

Read-only EasyEDA target instance ba833ce0-d12f-48eb-a2e7-19e177c25f2d,
project b61008d1318a445eb709a9e25738154d, schematic page
 a9ecb0ebd0f641ac8cd370a75d640abd; linked PCB
 b74ae77d4f744a42a5aa0201819c0d34 and comparison PCB b2764fbf14f709e5.
All 85 saved schematic pin/net lists match live readback. Component metadata and
footprint aliases differ, so the original fixture export is retained.

Mechanics were authored within the user's explicit freedom: 45 x 66 mm, original
fixture 31 mm screw spacing and motor center (0,11.8), centered AS5600 on bottom,
42.3 mm TOP motor face, four two-sided 8 mm screw-access regions. USB tabs, motor
header, diagnostic header and driver module stay outside the motor face.
The comparison PCB has AS5600 exactly centered on its screw pattern; the linked
PCB has a different translated mounting position and currently unplaced parts.
No live board mutation or import was performed.

Three focused 15-part mechanical previews used the current runPcbLayout source:

1. Initial motor/driver zoning: SW2 collided with SCREW4 and USB3 through-hole
   occupancy collided with U7/J1. Resolved footprints also showed that USB1's
   mounting tabs would protrude under the motor even though its body was bottom.
2. Move all three USB ports to upper extension and J1 to internal vertical-header
   position; move buttons away from screws. Remaining CN1/SW2 clearance 0.05 mm
   versus 0.45 mm required, so move the buttons another 1 mm to y=19.
3. Final mechanical preview: report.ok=true, zero overlaps, outside-board parts
   and constraint-region violations. Rendered preview inspected. 85-part DSL
   validation and TypeScript checks pass. Each repeat follows a measured defect
   and a changed mechanical input; no identical-input retries.

Commands from backend root:

```sh
node --import tsx tests/pcb-layout/STEPPER_CONTROLLER/STEPPER_CONTROLLER.ts --validate
node --import tsx debugging/pcb-layout/STEPPER_CONTROLLER-v2/mechanical.ts
node --import tsx tests/pcb-layout/STEPPER_CONTROLLER/STEPPER_CONTROLLER.ts
npm run typecheck
```

Full run log: debugging/pcb-layout/STEPPER_CONTROLLER-v2/full-run.log.
Full artifacts: debugging/pcb-layout/STEPPER_CONTROLLER.
Automatic search acceptance and the final checked reference are distinguished below.

## First full run and corrected input

The first full placement completed but was rejected: 8 overlaps, chiefly DD1/U7
and DD1/clamp-diode bodies, and U10.2–C37.2 at 4.37 mm versus hard 3 mm.
No outside-board or motor-face region violations; graph ownership passed.
Saved unaccepted result: ignored v2/full-first.json. No live application.

The corrected input locks DD1 and U7 to their already inspected mechanical-preview
poses and moves the four phase-clamp satellites to BOTTOM. This frees the upper
TOP area for the module/heatsink and the two headers, retaining all other mechanics.
A second complete native run is justified by these measured collisions and the
changed DSL. Its stderr logged compact_candidates.rs:52 assertion failure
(c.problem.bounds.is_none()), then continued through the backend fallback; this is
a backend defect, not a clean solver execution. The fixture's acceptance conditions
remain enabled. No hard distance was relaxed.

The final fixture additionally verifies actual TOP body boxes, all projected
through-hole pad boxes and two-sided screw-access boxes with current backend
geometry helpers, independently of region diagnostics. --verify-output rechecks
saved automatic output with freshly resolved geometry, without rerunning search.

## Final local repair and user-requested notch

The second full run completed with no outside/region violations and correct large
mechanics, but 8 status-pair/USB/clamp overlaps and the same 4.37 mm bootstrap
violation. Saved raw evidence: v2/full-second.json. Search stalled on this repeated
bootstrap defect, so skill-permitted local geometry repair followed rather than
repeating an unchanged search. Four bottom LED/resistor pairs were arranged at
x=-17/-13.5, y=5/8.5/12/15.5. C37 moved to (-3.7,-4.3,0), R13 to
(-6.4,-4.3,180); D40 moved to y=22 after the independent screw-access test found
its previous 0.27 mm intrusion into the required clearance margin.

The user then explicitly replaced antenna overhang with a cutout. R2 outer corners
and 45 x 66 mm envelope remain. The lower open notch is 15.4 x 5.5 mm, root y=27.5.
ESP moves to (0,24.25,0,bottom); C32/C13/R20/C8/R6 move clear of the module and
notch. Four screw datums, AS5600 axis and every other interface stay unchanged.
All actual pads were checked, including lower ground/EP pads: local maximum pad
y=2.5999, world maximum=26.8499, root margin=0.6501 mm. The initial side-pad-only
estimate of 1.9 mm was insufficient; the final assertion checks every pad box.
Module body ends at y=32.55, inside the outer y=33 envelope.

Final independently rebuilt report: report.ok and graphReport.ok true, 85 unique
components, zero overlaps/outside/regions/hard distances. Fixture assertions also
pass for two-sided 8 mm screw access, TOP motor body exclusion, through-hole
projections and supported ESP pads. 17 localized designators changed from the raw
second run. The reference is saved with manual provenance in the fixture directory.
Top/bottom component previews were rendered with the current backend and visually
reviewed; combined view: v2/repaired/sides.png. No live EasyEDA placement applied.

```sh
node --import tsx tests/pcb-layout/STEPPER_CONTROLLER/STEPPER_CONTROLLER.ts --validate
node --import tsx tests/pcb-layout/STEPPER_CONTROLLER/STEPPER_CONTROLLER.ts --verify-reference
npm run typecheck
git diff --check
```

All these final checks passed. This is a checked manually refined reference, not
a successful pure automatic run. The final notched DSL has no new full automatic
run; default runner remains strict. Raw solver failures, fixed-part region-report
blind spots and compact_candidates bounds panics remain exposed as backend issues.
No production solver changes were made for this task.

## Board Package root-cause investigation (2026-10-05)

The saved second full run was traced through all five stages. All eight component
clearance conflicts already exist at `01-v2-tree` (after board packing), and their
pairs/gaps are unchanged at `02-v2-legalize`, `03-v2-post-place`,
`03b-v2-board-alignment`, and `04-v2-invalid-final`. The comparisons use the same
resolved component geometry. The current input contains the later antenna notch;
its additional outside/region diagnostics must NOT be attributed to the earlier
pre-notch run. The original saved second-run report has zero outside/region errors.

Every conflicting pair crosses one of two family boundaries:

- driver / usb_data: D2-R36, C2-LED4, C2-R18, C2-LED6, LED4-R39, R36-R39.
- driver / motor_port: D7-LED3, D7-R16.

All three board primitives are `locked:true, anchored:true`. However the three
status LED/resistor satellites, clamp satellites and USB support parts are free
children; only their DD1/U7/USB1 mechanical anchors are fixed.

The implementation chain is concrete:

1. `primitives.ts:142` propagates any locked child to the complete union primitive.
2. `tree-solver.ts:957` marks locked families as anchored. Each family is solved
   separately; scoped block validation does not include other complete families.
3. `board-solver.ts:168` retains anchored families whole, before the mechanical
   group dissolution path. `encode-board-problem.ts:122` encodes them as locked.
4. Native `solver.rs:291` puts them in the initial placed set. Local improvement
   skips locked primitives; `solver.rs:1156` returns no separation variants for
   a locked/locked pair. The native solver detects the collisions but cannot
   repair them by moving the free children inside these rigid families.
5. The wrapper consumes `.result` without an early hard-rank acceptance gate.
   Invalid geometry is exposed by the later final report, not accepted as a
   valid final board.
6. `auto-place.ts:117` only restores fixed component poses at the stage named
   legalize. It performs no spatial legalization; the synchronous alternative
   global-legalization call is commented out at line 73.
7. Portfolio selection has no driver or usb_data alternatives in this run, only
   one motor_port alternative. It stops recursion at anchored families and
   requires an entirely valid board for any replacement. A single-family change
   cannot remove both independent conflict groups. The saved diagnostic records
   six portfolio owners, 38 proposals, zero accepted.
8. Post-place refinement generates rotations/swaps, not translational repair
   moves (`post_place_refine.rs:911`). Alignment also excludes locked/anchored roots.

### Native reduced reproduction

Commands from backend root:

```sh
node --import tsx debugging/pcb-layout/STEPPER_CONTROLLER-v2/diagnose-stages.ts
node --import tsx debugging/pcb-layout/STEPPER_CONTROLLER-v2/repro-locked-families.ts
node --import tsx debugging/pcb-layout/STEPPER_CONTROLLER-v2/check-released.ts
```

The reduced input reuses the actual driver, motor_port and usb_data primitives,
30 resolved components, current native addon, and current board regions. It
preserves the real component positions in the affected board area. No production
code, weights, board dimensions or fixed anchor poses are changed.

| Diagnostic representation | Native hardCount | hardSeverity | Anchor movement |
| --- | ---: | ---: | --- |
| Three locked complete families, before solve | 2 | 2.7925033569 | none |
| Three locked complete families, after solve | 2 | 2.7925033569 | all three dx=dy=rotation=0 |
| Same 30 parts, expose three free status satellites as separate board primitives | 0 | 0 | DD1/U7/USB1 unchanged |

Native hardCount here counts conflicting primitive pairs, not the eight individual
component pairs. The released representation completes on CubeCL/CUDA, RTX 3060
Laptop; the command including cold GPU setup and both solves took about 9.5 s.
This is a causal diagnostic of missing degrees of freedom, NOT a passing complete
85-component replay, electrical-quality comparison or a production fix. A separate
check which overlays the reduced result onto the untouched 85-component board
finds seven new collisions with objects omitted from the reduced solve. Therefore
the reduced positions must not be applied to the complete fixture. A real repair
must search with all board geometry and preserve parent/satellite relations.

Generated results are in ignored `v2/repro-locked-families-result.json` and
`v2/repro-released-status-result.json`. The board fixture and checked manual
reference remain unchanged by this investigation.

### Separate issues

The bootstrap violation predates board packing: the tree diagnostic explicitly
reports U10.2-C37.2 at 4.400 mm and `hard:true drift accepted with x100 excess
penalty` (`island-solver.ts:108`). Postrefine reduces it only to 4.37 mm. This is
an island distance-admission policy issue, separate from locked-family collisions.

The recorded GPU panic also has a concrete suspicious path: ordinary compact
`generate` dispatches bounded problems to the bounded generator, but compact
`scarcity` at `compact_candidates.rs:508` has no such dispatch. GPU frontier
calls it at `gpu_frontier.rs:81`; net-anchored candidate generation reaches
compact `fit_to_bounds`, which asserts `bounds.is_none()` at line 52. Fixed-family
block inputs carry bounds (`tree-solver.ts:451`). This explains how a bounded
family can reach that assertion despite the guard in ordinary `generate`.
The exact earlier failing native call was not captured, so this code path has
not yet been independently replayed. CPU fallback does not release locked board
families and therefore cannot resolve the main demonstrated failure.

Recommended implementation direction: keep mechanical anchors fixed, expose
movable satellites or jointly re-solve anchored-family interiors against all
board obstacles, preserve electrical/group relations, and use a native hard-rank
repair gate which can accept partial legalizing progress from an invalid initial
state. Simply clearing `locked` on a complete family would move its mechanical
anchor and is not a valid fix. Validate with the full 85-component pipeline.

## USB redistribution and full v3 run (2026-10-05)

The user clarified that bottom-mounted USB retention tabs are flush on TOP and
may occupy the motor face. The driver module has protruding parts and stays TOP,
outside the motor face. This overrides the earlier conservative USB-tab exclusion.
No board growth was needed: 45 x 66 mm and the antenna notch remain unchanged.

USB1 data moves from left y=-15 to left y=6; USB3 UART moves from right y=-15
to right y=6. USB2 power stays near the driver, left y=-23 instead of -27.
CN1 moves from right y=12 to 17, and SW2 from right y=19 to -11 to clear the
connector corridor. U1, DD1, U7, J1, U4 and all four mounting datums remain unchanged.
Only the bottom USB blocks are exempt from the TOP motor placement region. Actual
USB pads remain in the native electrical collision model, must be supported by
the board, and must clear the two-sided screw tool-access regions.

Four status LED/resistor pairs become board-level blocks with explicit external
near-to-pin relations. This retains electrical placement intent while allowing
Board Package to move them independently of fixed driver/MCU families. No native
solver code, numerical objective, search budget or hard-distance rule changed.

The focused 15-part mechanical preview passed both the standard report and the
independent actual-body/tab/screw/pad-support checks. Its sides.png was inspected.
The full 85-part run then completed in 152.047 s. Automatic geometry is valid:
zero overlaps, outside-board parts and constraint-region violations, and graph
ownership passes. The previous eight inter-family conflicts are gone. The explicit
bootstrap hard distance remains 4.37 mm versus 3 mm. Three compact GPU block
searches again assert bounds.is_none and replay on CPU. The raw result is therefore
not accepted by the strict fixture, despite report.ok=true for geometry.

Exact resolved input and native problem/solution captures are retained under
`debugging/pcb-layout/STEPPER_CONTROLLER-v3/native-capture/`; stderr including the
three assertions is v3/full-run.stderr.log, and v3/summary.json records timing and
violations. The unchanged previous automatic board/stages/reference remain in
v3/previous-automatic and previous-reference.json. The current fixture's raw output
path is v3/automatic, preserving the previous board evidence directory.

Independent screw checks require the existing extra 0.35 mm margin outside the
8 x 8 mm regions. The raw placement leaves C21 only 0.1399 mm and R4 only 0.0478 mm
from SCREW3 tool access; native region legality alone does not enforce this margin.
Local repair moves C21/C24/C32 together upward 0.25 mm and R4 left 0.35 mm. Keeping
the supply capacitors together preserves their clearances. C37 moves to
(-3.288,-7.391,0) above U10, and LED2 moves to (1.5,-9,90) to free that bootstrap
slot. Only six of the 85 component poses differ from the new automatic result.
The current fixture reference records the manual provenance and exact changes.

The completed reference passes a freshly rebuilt current-backend report, graph,
all hard distances, supported USB/ESP pads, actual TOP motor bodies/protruding
non-USB pins, and two-sided screw access. Full top/bottom previews were rendered
and inspected at v3/repaired/sides.png. No live EasyEDA assembly or routing.

Validation:

```sh
node --import tsx tests/pcb-layout/STEPPER_CONTROLLER/STEPPER_CONTROLLER.ts --validate
node --import tsx debugging/pcb-layout/STEPPER_CONTROLLER-v3/run.ts
node --import tsx debugging/pcb-layout/STEPPER_CONTROLLER-v3/check-mechanics.ts debugging/pcb-layout/STEPPER_CONTROLLER-v3/repaired/placement.json
node --import tsx tests/pcb-layout/STEPPER_CONTROLLER/STEPPER_CONTROLLER.ts --verify-reference
npm run typecheck
git diff --check
```

All final reference checks pass. The normal automatic fixture and --verify-output
remain strict and expose the retained bootstrap defect; the manual reference does
not claim a successful pure automatic solve. The raw full run used
PCB_LAYOUT_DEBUG_DIR=debugging/pcb-layout/STEPPER_CONTROLLER-v3/native-capture.

# Pad access rows rounded on load, 2026-10-19

Question: can the block solver round the pad access rows of a component that never moves, so CPU and GPU score it on the same geometry ([issue #16](https://github.com/biosshot/eda-copilot-backend/issues/16), option 1), without changing any placement?

Cause: `rebuild_component_geometry` rounds access rows to the 0.001 mm grid whenever a component moves, and the GPU kernel rounds them in `geometry_box` on every evaluation. A component that never moves, typically an authored `fixed` connector or MCU, kept the input rows on CPU. H743's USB1 arrives with `-3.4999 / 3.5001`, so its dense IC access term was 298.1422 on CPU and 298.2039 on GPU, and the CPU itself scored it differently before and after its first move.

Change: `prepare_context` rounds the working copy of every component's access rows with `translate_box(row, 0, 0)`, the same operation a move to the authored pose performs. `source_components` keeps the authored rows, and moves still rebuild from them. Rounding the source rows too (the first version of this change) changed the geometry of moved components: `js_round` rounds half ticks towards +∞, so a half-tick row (ELRS U1, `2.8025`) rounded before a 270° rotation lands on the other tick than when rounded after it. That version changed three ELRS block scores by about 0.17; this one leaves every moved geometry as it was. Primitive placements, including authored fixed poses, are not touched.

Test: `unmoved_access_rows_match_moved_geometry_and_keep_fixed_pose` loads the captured H743 `usb_cc` block (fixed USB1) with an added half-tick row. It checks that USB1 keeps its authored pose, that its loaded rows are the rounded ones and equal the rows of a move to the same pose, that `source_components` keeps the authored rows, and that after moves at 0°, 90°, 180° and 270° the rows equal the authored rows rotated and translated (rounding first would differ). It fails on `main` and passes with this change.

## Comparison

Host: Apple M5 Max, macOS 27, Node 22.22.3. Every native call was captured with `PCB_LAYOUT_DEBUG_DIR`, native solve cache off, and compared by input SHA-256; wall-clock profile fields are ignored. Three builds of the same tree:

- **before**: `main` (3bc1a08), CPU everywhere (`PCB_BLOCK_BACKEND=cpu`, `PCB_BOARD_BACKEND=cpu`, `PCB_POST_PLACE_BACKEND=cpu`), 2 / 16 / 16.
- **after**: this change, same settings.
- **GPU**: this change plus a local, unpublished patch that lets vendored `cubecl-wgpu` select Vulkan on macOS (`AUTO_GRAPHICS_BACKEND=vulkan`, Mesa KosmicKrisp). `cubecl` requested for blocks, board and refinement, one process (0 / 16 / 16) so that no subtree worker waits on the GPU lock. Every run's log was checked for the actual backend.

Fixtures: the 21 runnable `tests/pcb-layout` directories except PortableScope, which is too expensive to rerun in full. Five stop before a final placement on `main` as well, with byte-identical errors in all three builds: USB_ISOL, PICO_DUCK and PROCEDURAL_FOOTPRINTS (DSL validation), CNTRL_ACESS_MAX (`relation block:load_switch_3v3 spans multiple rigid primitives`) and ESP32_C3_MAN (`Native primitive transform mismatch for primitive:tree:block:digital_input_3`). Their block calls are still compared. Portable_AC_DC_Telemetry, STEPPER_CONTROLLER and esp32c3 fail their own fixture assertions after a complete placement, also identically on `main`.

### Before versus after (CPU)

| | Fixtures | Unique block inputs | Identical block solutions | Final placements compared | Components | Final poses changed |
|---|---:|---:|---:|---:|---:|---:|
| main → this change | 21 | 698 | 695 | 16 | 847 | 0 |

Every block input is shared, so every block received the same problem, and every board and refinement call is byte-identical. The three differing block solutions have identical poses (position, rotation and layer of every component) at every checkpoint (`beam`, `singles`, `pairs`, final), zero hard violations in both builds, and differ only in score. In each one the off-grid rows belong to an authored fixed component that never moves:

| Fixture | Block call | Fixed component, input rows | Score before → after |
|---|---|---|---|
| ESP32_C3_MAN | `mcu` family (`mcu_supply` … `mcu`) | U3, top/bottom `30.4001 / 41.8999` | 13 265 691 → 13 265 690 (beam 13 265 807 → 13 265 806) |
| Portable_AC_DC_Telemetry | `mcu` family, first call | U5, top/bottom `25.0013 / 42.4113` | 24 195.586 → 24 195.605 |
| Portable_AC_DC_Telemetry | `mcu` family, second call | U5 | 13 943.874 → 13 943.959 |

In all of H743's 81 block calls, including `usb_cc` with USB1, solutions are byte-identical: the #16 difference was in candidate scores during the search and did not change any chosen pose or final score.

### CPU versus GPU (after)

All 698 block inputs are shared and 697 solutions are byte-identical. Of the GPU block calls, 35 fell back to CPU by design (`unsupported block features for complete GPU scoring`: CNTRL_ACESS_MAX 7, STEPPER_CONTROLLER 9, Portable_AC_DC_Telemetry 6, ESP32_C3_MAN 4, esp32c3 4, ThunderF722 2, one in each CONNECTOR fixture); the rest ran on `cubecl`. All 16 final placements are identical to CPU.

The one difference is unrelated to access rows: Portable_AC_DC_Telemetry `modem_key`, a single movable primitive with three passives (Q1, R22, R23) and no access rows. GPU picked another arrangement scoring 509.476288 against CPU's 509.476257 (3·10⁻⁵ higher). The board problem that follows differs, but the final placement of all 154 components is identical. The same block also differs with the GPU build of `main` (below).

### GPU before versus after

The final block solutions do not show the original difference, because the CPU rescores the chosen pose and the 0.0001 mm row offset did not change which candidate won: the GPU build of `main` (same patch, `main` block solver) also gives 81 of 81 H743 and 74 of 74 ESP32_C3_MAN block solutions identical to CPU `main`, and in Portable_AC_DC_Telemetry it shows the same `modem_key` difference as the GPU build of this change.

`PCB_BLOCK_GPU_VERIFY=1` compares every GPU candidate score with a CPU evaluation of the same candidate (blocks on `cubecl`, board and refinement on CPU):

| Fixture | GPU build of `main` | GPU build of this change |
|---|---|---|
| H743 | fails in the `usb_cc` family (calls 7 and 8 running): `CPU=2016.4834 GPU=2016.545 phase=search` | passes: all 81 block calls, every candidate |
| ESP32_C3_MAN | fails: `candidate 458: CPU=274.90826 GPU=274.90616 phase=local_improve` | same failure |
| Portable_AC_DC_Telemetry | fails: `candidate 1352: CPU=118762.3 GPU=118762.336 phase=local_improve` | same failure |

The H743 failure is the 0.06 dense-access difference of #16, and this change removes it. The `mcu` family calls containing U3 (ESP32_C3_MAN) and U5 (Portable_AC_DC_Telemetry) completed and passed verification with both builds: there the row offset moves the score by less than the diagnostic tolerance. The other two failures are identical with and without this change, in other blocks; they are separate CPU/GPU differences, not caused by access rows, and remain open.

## Verdict

Keep. Fixed poses and every final placement are unchanged on CPU; the only CPU differences are the scores of three blocks with an unmoved, fixed component, which now use the geometry the GPU already used. Tests: `cargo test --release` (103 pass; `interval::tests::outward_bounds_survive_ftz_and_cancellation` fails identically on `main` on this macOS arm64 host), `npm run typecheck`, `npm run test:pcb` (488 pass, 0 fail, 40 skipped).

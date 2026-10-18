# Subtree dispatch before synchronous children, 2026-10-18

Question: do independent board children actually run in parallel when `PCB_LAYOUT_SUBTREE_WORKERS > 0`?

Finding: no. `solveNodeAsync` maps the children with an async callback, but a child that is not sent to a worker is solved synchronously inside that callback, before any later child is dispatched. Families with a fixed or edge component (`mcu` in Portable_AC_DC_Telemetry and STEPPER_CONTROLLER, 13 s each) were never eligible and always ran on the main thread first. A temporary per-node timer (start, end, process) showed the worker children of Portable_AC_DC_Telemetry starting 17.9 s into the block phase, and those of STEPPER_CONTROLLER 22.7 s in.

Critical-path ceiling of the board children (2 / 16 / 16, `main`): Portable_AC_DC_Telemetry 32.2 s → 13.4 s, STEPPER_CONTROLLER 28.4 s → 13.1 s, STM32G0_CAN_RS485 8.0 s → 5.9 s. H743, ThunderF722, ICM20948_v2 and rp2040_base gain 1–4 %, because one MCU family dominates them.

Change:
- Every worker subtree is queued before the remaining children are solved on the calling thread, and one `setImmediate` lets the pool start its processes and send the inputs before that thread blocks. Results keep the child order.
- Fixed and edge families may run in a worker. The worker receives the complete input and solves the family from the same node. `parent` only matters for component nodes, and a board child is never one.

Host: Apple M5 Max (6 super + 12 performance cores), macOS, Node 22.22.3. Native addon of `main` in both builds (SHA-256 prefix `e66e7da4f8ddc4f5`). All 15 `tests/pcb-layout` fixtures, configurations interleaved, two passes, because single runs of the same input differed by up to ±4 s. Medians:

| Fixture | main, 2 / 16 / 16 | this change, 2 / 16 / 16 | this change, 4 / 16 / 16, `PCB_LAYOUT_SUBTREE_MIN_COMPONENTS=4` |
|---|---:|---:|---:|
| Portable_AC_DC_Telemetry | 197.2 s | 192.3 s | 181.4 s |
| H743 | 90.8 s | 91.0 s | 89.3 s |
| ThunderF722 | 94.7 s | 92.2 s | 93.1 s |
| ICM20948_v2 | 68.8 s | 68.4 s | 65.6 s |
| STEPPER_CONTROLLER | 50.7 s | 43.5 s | 38.5 s |
| STM32G0_CAN_RS485 | 29.9 s | 30.0 s | 28.3 s |
| rp2040_base | 23.3 s | 23.3 s | 22.6 s |
| ESpower | 19.0 s | 17.1 s | 16.4 s |
| ELRS | 17.6 s | 13.4 s | 13.3 s |
| six small fixtures | 18.3 s | 18.7 s | 18.0 s |
| Total | 610.4 s | 590.0 s (−3.3 %) | 566.5 s (−7.2 %) |

The final poses are hash-identical across the three configurations and both passes for every fixture. `Portable_AC_DC_Telemetry`, `STEPPER_CONTROLLER` and `esp32c3` exit with code 1 from their own fixture checks, on `main` as well.

Verdict: keep. With the default `PCB_LAYOUT_SUBTREE_WORKERS=0` nothing changes. Tests: `npm run test:pcb` (481 pass, 0 fail).

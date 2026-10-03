# Same-pad signalPath waypoints — 2026-10-03

Consecutive segments may now meet at the same pin: `U5.6 → D5.1 → J5.1`.
This is explicit placement intent, not automatic inclusion of low-pin-count
components. Different pins on the intermediate component retain series-stage
semantics. Existing pin existence, per-segment same-net and component continuity
checks remain in place.

Only the same-entry/exit prohibition was removed from the DSL and circuit
validators. Existing native `signal_path.rs` already excludes zero-length edges
before computing distance/turns and computes facing only for authored external
segments. Bridge generation supports coincident entry/exit positions. Native
scoring code, weights and contracts were not changed.

STM32G0_CAN_RS485.js now declares both CAN legs through D4 and both RS485 legs
through D5. The existing soft 5 mm protection-to-connector constraints moved into
the second segment of each path; their duplicate criticalPair declarations were
removed. No other fixture intent changed.

Validation: fixture `--validate`, typecheck and build passed. Two new tests cover
normalization, both external relations, wrong-net rejection, zero internal turn,
detour sensitivity and bridge generation. Full signal-path suite: 9 passed,
1 failed (the previously documented cross-block RF placement report.ok failure).

Full capture: `debugging/pcb-layout/runs/STM32G0_CAN_RS485/2026-10-03T16-27-56-868Z`.
68 placements, report.ok=true, overlaps=0, outsideBoard=0, hard hint violations=0.
All five paths resolve. Protection-to-connector distances: CAN_H 4.73 mm,
CAN_L 6.52 mm, RS485_A 3.58 mm, RS485_B 6.85 mm. Thus CAN_L and RS485_B still
exceed their soft 5 mm goal. CAN_H has zero reported detour/turns; the other legs
are not all straight. Supporting waypoints does not guarantee optimal placement
or copper routed through those pads. No routing was run.

Logs: `debugging/waypoint-{build,tests,stm}.log`. Capture time is not used as a
performance comparison because some tests ran concurrently. The existing native
addon was reused without recompilation.

## Retained scope after experiment rollback

The geometric Board Package and obstacle-priority experiments were removed.
Native solver sources match e1dc170; Board Package retains Micro-A*.
Final post-place now passes minDelta=100 into the existing Rust evaluator,
accepting only effective improvement strictly greater than 100, including
the existing route correction. Local block refinement thresholds are unchanged.
No scoring weights or candidate generation changes are retained.

Validation: TypeScript typecheck passed; post-place suites passed (21 tests,
6 GPU-only tests skipped). The complete Signal Path suite retains the previously
documented RF report.ok failure above; all other 9 cases passed.

Restored native addon rebuilt successfully; Rust tests: 99 passed, 5 ignored.
Exact saved STM32 post-place replay (17:18 run, legalize output) accepted only
C3 flip (67971), R13 flip (153.5), and C18/C20 swap (104.25). The R15/R16
swap was not accepted. This verifies the threshold, not overall board quality.
Evidence: ignored debugging/final-threshold-100-replay.json.

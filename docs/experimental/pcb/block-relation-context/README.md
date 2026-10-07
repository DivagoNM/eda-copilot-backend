# Board relation context after block folding

2026-10-06. Minimal correction to Board Packer relation endpoints.

## Problem and scope

An authored `block:voltage_divider` relation resolved to the packing center of
the containing `voltage_isolation` primitive after satellite folding. References
whose source tree node disappeared (`current_filter`, `buck_input`) resolved to
Missing and contributed no relation cost. Component/pad endpoints were intact.

The native input already retains `ComponentGeometry.block_name`. Before CPU/GPU
preparation, reconstruct each referenced block's body bounding-box center from
its original members. Attach it to the containing primitive as a connection point
with no net. Resolve the block relation to that point through the existing pad
endpoint path. Existing rigid transforms, candidate generation, compact GPU
templates and relation arithmetic then preserve its position inside the parent.
FastRoute excludes the point because it has no net. No weights or search budgets
change. No source fixture changes are part of this correction.

The initial change covered `block:` endpoints. Module references were unchanged. Legacy
inputs without component ownership retain tree-based resolution. A referenced
authored block spread across multiple rigid primitives is rejected explicitly;
it cannot be represented by one rigid point and must not silently target one
arbitrary parent. Placement score contract is now 7; payload format is unchanged.

## Validation

- Rust unit suite: 87 passed, 4 ignored. Regression checks missing tree identity,
  idempotent preparation, no electrical net, rotation, translation and changed
  relation cost.
- TypeScript typecheck passed.
- Native board tests: 12 passed. Folded-group regression passed with GPU enabled:
  CPU result equals the equivalent explicit-point problem and GPU returns the
  same solution without fallback (`PCB_BOARD_GPU_VERIFY=1`).
- Native release addon rebuilt successfully.

On the reconstructed Portable Telemetry board solution, the original evaluator
reproduced the captured rank exactly before the change. The same whole-block U1
180-degree rotation changes score by +42,242 before this fix and -17,884 after it,
with unchanged hard count/severity. Group-to-J1 cost now decreases from about
61,742 to 1,808 on rotation, instead of measuring the merged parent. The previously
missing current-filter-to-R6 relation now contributes about 1,754. These are
native score differences, not evidence of completed physical routing.

Saved inputs used for integration verification (original captures remain intact):

- `Portable_AC_DC_Telemetry/2026-10-06T07-51-22-429Z`.
- `STM32G0_CAN_RS485/2026-10-06T09-10-00-243Z`.

The additional full Telemetry CPU replay was stopped after several minutes on
one thread; no completed CPU solution or CPU/GPU parity claim is made for that
large replay. Its captured placements were evaluated successfully above.
The subsequent integration replay uses GPU for Telemetry and CPU/GPU for STM32.

Telemetry GPU replay completed without fallback (194.0 s, requested one CPU
thread). U1 now rotates to 0 degrees, U2 to 180 degrees. J1.1-to-R1.1 distance
decreases from 38.00 to 7.00 mm; R6.1-to-R7.1 from 16.59 to 8.97 mm;
R6.2-to-R8.1 from 15.08 to 11.51 mm. Native hard rank remains 5 violations,
severity 19.7757835. The final score is 20,613,828 and independently reconstructed
quality matches it exactly. This is a board-stage replay, not a full-pipeline
validity result or a controlled performance comparison against the old capture.

STM32 CPU and GPU full board replays returned identical complete solutions:
hard count/severity 0, score 15,129.9609375; GPU completed without fallback.
Recorded wall times were 95.8 s CPU and 30.0 s GPU. These are diagnostic times,
not a benchmark: an accidentally duplicated STM32 CPU attempt overlapped briefly
with the recorded CPU replay and was stopped; it produced no solution. No full
pipeline rerun or claim of optimal CAN/RS485 routing is made.

Generated diagnostic scripts, logs and replay solutions live in ignored
`debugging/block-context-*` and `debugging/block-endpoint-*` files.

## Follow-up audit: internal signal paths (2026-10-07)

Status: **needs validation; provisionally acceptable for a rigid internal path**.
This is not currently an approved scoring change or a mandatory fix.

In the saved STM32 input above, the `hse_clock` segments X1.3 -> R8.1 and
R8.2 -> U3.8 have authored high-priority path relations at child scopes. These
relations are not forwarded to Board Packer, while their endpoints and path
ports survive inside the same rigid MCU primitive. Board path topology therefore
uses fallback metadata, and FastRoute cannot derive the explicit signal-path
classification from those omitted relations.

Omitting internal distance terms can be intentional: a rigid parent move cannot
improve its internal path geometry. Per user review, treat this case as
provisionally acceptable rather than restoring every child relation by default.
Validation remains necessary for interactions with other primitives: determine
whether losing the authored path classification changes crossing/foreign-pad
penalties and candidate ranking as the parent moves or rotates. Distinguish those
global interactions from constant internal costs before deciding on a change.
No solver behavior or weights were changed for this audit note.

## Block Solver and module follow-up (2026-10-07)

Block Solver now prepares referenced block centers from original component
ownership, including when tree identity disappeared inside a rigid family member.
Board Packer uses the same native `group_endpoints` helper for blocks and modules.
Its encoder records module-to-component membership from the placement tree before
native primitive resolution. Both solve and quality entry points prepare the
same non-electrical points; CPU/GPU reuse existing point transformations and
endpoint arithmetic. Weights and scope filtering are unchanged. Score contract
is now 8; the optional `relationGroups` board payload field is backward compatible.

An external group absent from a local solve remains unresolved, as before.
Legacy native inputs without module membership retain tree-based resolution.
A referenced group with members in multiple independently movable primitives is
rejected rather than assigned to the first owner. This correction represents
rigid nested groups; it does not introduce a dynamic multi-owner group objective.
The existing Board Packer check rejecting references to dissolved groups remains.

The scope audit found no dropped cross-primitive group conditions in 138 saved
native inputs: 20 group relations in Telemetry and 17 in STM32, with 47 and 34
cross-primitive occurrences respectively. Every such occurrence was forwarded.
Ordinary block-to-block scope uses the common ancestor, so the previously
suspected filter issue is not treated as a confirmed bug.

Validation of this follow-up:

- Rust suite: 88 passed, 4 ignored; includes a block endpoint rotation test.
- TypeScript typecheck and native release build passed.
- Native board/F32 tests: 16 passed.
- Five focused tests passed, including real CPU/GPU group-versus-explicit-point
  solve comparisons, matching quality evaluation, module membership encoding,
  and rejection of split module ownership. No GPU fallback in these tests.
- Saved STM32 block call
  `native/block/process-8616-thread-0/00018-buck_core_buck_input_buck_output_buck_feedback-e05d275be3/problem.json`:
  the previous CPU score was 6192.45166015625. New CPU and production GPU return
  identical complete solutions, score 6192.39599609375, hard count/severity zero,
  without GPU fallback. Different objectives mean this score delta is not a
  physical-quality improvement claim. Diagnostic times: CPU 2.55 s, GPU 12.42 s
  including cold CUDA compilation; not a performance benchmark or full-board run.
- **Open GPU verification limitation:** strict candidate verification on that
  saved input fails in search (CPU 281789.88, GPU 281845.9). A control with all
  block/module endpoint relations removed also fails (279563.06 vs 279618.16),
  so the mismatch does not require the new group points. Production final-result
  equality above does not establish per-candidate parity for this input. The
  production replay was run separately after the failed verification/control;
  logs and failure capture are under ignored `debugging/group-endpoints-*`.

Native addon SHA256:
`748518A757731289CB8D1983FEA786960DB09B1B9D8F68A48CF3D4EBD4033295`.

## Pair continuation inventory correction (2026-10-07)

The full STM32 capture `2026-10-07T07-52-40-375Z` exposed a missed integration
path: the deferred-pairs checkpoint includes derived group connection points,
but the next TypeScript-encoded source problem does not. Native validation ran
before preparing those source points and rejected the legitimate checkpoint as
`invalid pairSeed geometry or inventory`. In captured block request 00024, the
extra references were `block:buck_feedback`, `block:buck_input`, and
`block:buck_output`.

Prepare the source group points before validation in single, batch, and quality
entry points using the same idempotent helper. Keep checkpoint coordinates and
all inventory/locked-primitive checks intact. A regression first reproduced the
failure with the previous addon; it covers deferred-pair resume through single
and batch calls, locked group ownership, full-search equivalence, and rejection
of an unexpected checkpoint point. This is a continuation fix, not a score change.

Validation: Rust 88 passed / 4 ignored; TypeScript typecheck passed; native addon
rebuilt; both CPU and actual CubeCL continuation regressions passed without
fallback. The full command `npm run debug:pcb-layout -- capture STM32G0_CAN_RS485`
completed in 80.29 s, exit 0, `Placement valid: true`, 76 native requests, at
`debugging/pcb-layout/runs/STM32G0_CAN_RS485/2026-10-07T08-00-28-725Z`.
The full run used default `auto` backends; two block calls recovered to CPU due
to `GPU admission pending in this process`. This is not a no-fallback benchmark.
Its manifest records addon SHA256
`4453acd203778879bab97aeabeb83873f3996bb9093abe452112c1bdfa6f00bc`.

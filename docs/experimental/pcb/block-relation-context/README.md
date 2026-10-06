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

This change covers `block:` endpoints. Module references are unchanged. Legacy
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

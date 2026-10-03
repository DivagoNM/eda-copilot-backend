# Small-block ground and bypass pad alignment

## Scope — 2026-10-03

Two user-approved changes in `placement-graph.ts`:

- `addSmallBlockGroundHints`: preserve automatic ground links for eligible small blocks, but use `normal` (70), previously `critical` (240). Eligibility, maxDistance=8 and hard=false are unchanged.
- Compile bypass from the capacitor pad connected to the authored target pin's net, instead of the capacitor component centre. For STM32 clock: `pad:C15.1 → pad:X1.4`, priority high (140). A capacitor without a matching footprint pad produces `bypass_missing_net_pad` instead of an invalid relation.

Rust scoring, candidate generation, compactness, DSL and PostPlace hint expansion are unchanged. The known missing bypass context in PostPlace is deferred. This is a general bypass compilation correction, not a C15-specific override; other bypass capacitors can also change placement.

## Capture and checks

- Baseline: HEAD `a2e6d0d`, STM32G0_CAN_RS485 capture `2026-10-03T18-54-38-877Z`.
- After: `2026-10-03T20-05-28-974Z`, `npm run debug:pcb-layout -- capture STM32G0_CAN_RS485`.
- Same native addon, no native edits/rebuild; SHA-256 `0a09161dffb175e5da17552ddc646793748bf87fe880a57ccebd7926afe8f345`.
- Full capture: 101.1 s baseline, 66.74 s after. One pass per version; no general speed claim.
- After: valid placement, 68 components. Capture 00044 explicitly contains C15.1→X1.4 bypass/high/140 and C15.2→X1.2 near/normal/70.
- `npm run typecheck`: passed.
- `node --import tsx --test tests/pcb-auto-place-v2-island.test.ts`: 26 passed, 3 failed. Updated ground test and new bypass pad/invalid-net test pass.
- Baseline graph and test from HEAD, temporarily copied next to their originals to preserve imports: 25 passed, the same 3 failures. Temporary files removed. Failures: `packs core pair components near their paired pads`; `solves two-component core pair islands by anchoring the main IC and balancing both paired pads`; `keeps alternate module orders when greedy packing reaches a dead end`.
- `git diff --check`: passed.

## Measured geometry

| Measurement | Before | After |
| --- | ---: | ---: |
| C15.1–X1.4, local clock, mm | 3.860 | 1.914 |
| C15.1–X1.4, selected family/final board, mm | 4.297 | 2.349 |
| R8.1–X1.3, selected family/final board, mm | 2.694 | 1.933 |
| R5.2–U3.10, selected family/final board, mm | 4.608 | 5.060 |
| R5.2–C16.1, selected family/final board, mm | 3.853 | 3.811 |
| MCU family area, mm² | 299.965 | 293.322 |
| MCU family MST/foreign-pad intersections | 1 | 0 |
| Native MCU family pad-crossing penalty | ~45 | 0 |

Scores of selected families are 8205.744 before and 7073.970 after, evaluated in their respective contexts. They are NOT directly comparable quality evidence because the objective relations/weights changed. Geometry and native pad-penalty measurements above are the relevant comparison. The removed crossing was X1.4→C15.1 through X1.3. These are straight-line/MST checks inside MCU family, not routed-board verification.

C15 improves, with the result preserved through Board Package and PostPlace in this run. R5–NRST gets longer; the reset problem remains. RS485 still has PostPlace swaps/rotations, and this experiment does not establish an overall improvement in board routing.

## Local artifacts

- `debugging/bypass-ground-audit/index.html`: before/after family and local clock pictures, measurements and caveats.
- `debugging/bypass-ground-audit/comparison.png`: same-scale MCU family comparison.
- `debugging/bypass-ground-audit/data.json`: reconstructed stage geometry/native evaluations.
- `debugging/bypass-ground-stage-audit.json`: local → family → board → PostPlace pad distances.
- `debugging/bypass-ground-tests.log`, `debugging/bypass-ground-baseline-tests.log`.

Verdict: targeted C15/clock improvement confirmed; leave broader placement issues for separate agreed changes. Commit pending user review.

# RS485: local assembly versus final PostPlace

Read-only audit of STM32G0_CAN_RS485 run `2026-10-03T20-05-28-974Z`. No production changes or new search runs. Pending ground/bypass changes from the previous task remain unchanged.

## Stage reconstruction

- Capture 63: beam 1037.4851, singles 1034.0962.
- Capture 66: pairs 1030.6016, selected local layout.
- Captures 64, 65, 67: local block postrefine, zero moves.
- Native board output preserves internal geometry.
- `selectBlockPortfolio` chooses RS485 variant 2, shift 0,0; board score 520382.47 → 520381.28. This layout matches beam. C21–U5.8 changes 1.907 → 2.214 mm. The PostPlace threshold does not apply to portfolio selection.
- Capture 73: final PostPlace swaps R14/R16 and rotates both 180°. It later rotates R15 180°. Final board alignment preserves these RS485 poses.

| Measurement | Before PostPlace | After R14/R16 swap | Final |
| --- | ---: | ---: | ---: |
| R14.1–U5.2, mm | 2.416 | 4.571 | 4.571 |
| R14.1–U5.3, mm | 2.216 | 3.343 | 3.343 |
| R16.2–U5.4, mm | 2.165 | 2.685 | 2.685 |
| R15.2–U5.1, mm | 2.165 | 2.165 | 3.158 |
| Rust block score | 1037.485 | 1429.586 | 1532.819 |
| Native local pad penalty | 45 | 270 | 315 |
| Local MST foreign-pad hits | 1 | 3 | 4 |

Block scores use existing native `evaluateBlockQuality`, not a new TS scorer. Absolute board poses are normalized to U5's local frame before evaluation so board rotation does not violate the block's original orientation constraints. Initial checkpoint scores reproduce their recorded ranks. Local diagrams use existing MST and segment/box helpers; their hit counts describe the isolated block, not the full board's MST or routed copper.

## Why the swap passes

Re-encoding full board poses through `encodeNativePostPlaceScoreProblem` and calling Rust `scorePostPlace` exactly reproduces capture 73: 1220659.500 → 1220247.875.

| Full-board score term | After minus before |
| --- | ---: |
| RS485_TX length terms | -58.654 |
| RS485_DE length terms | +13.466 |
| +3V3 length terms | -6.475 |
| Ratline crossings | -360 |
| Foreign-pad crossings | 0 |
| Explicit hints/paths | 0 |
| Total main score | -411.625 |
| Micro-A* correction | +1.071 |

Recorded effective improvement is 410.5 in F32, above minDelta=100. Five routing jobs, with two unresolved/budget-exhausted both before and after. Routing correction is not proof of routability.

Ratline-crossing reductions: DE/TX -180; RS485_B/+3V3 -90; +3V3/RS485_RX -90. This is not predominantly power attraction.

Global pad penalty remains 16335: DE gains a hit on U5.4 (+180), TX loses a net 180. TX's individual pad changes are: remove U5.3, C11.2, U3.11, C13.2; add C12.1, U3.2, U3.3. These were measured by native scoring with individual obstacles, not inferred only from SVG lines. External connections to U3.12/13 change the MST compared with the isolated block. A larger uniform pad penalty alone would not reject this particular swap: its pad-score delta is zero.

R15's later rotation: main score 1219355.625 → 1219255.5, improvement 100.125; global pad penalty falls 135 while length terms worsen about 34.9. Locally, it introduces +3V3 crossing R15.2.

## Root cause and next proposal

`block_solver.rs::connected_pin_stretch` protects passive-pad proximity to connected ICs, with extra cost beyond 3 mm. The PostPlace objective (`post_place.rs::score`, constructed by `post_place_refine.rs::score_problem`) contains global MST length/crossings and explicit hints/paths, but not this implicit local-stretch term. R14/R16 have no explicit local near/critical_pair hints to U5 in this DSL. This is not evidence that an authored R14/R16 relation was lost; the stage objectives have different terms despite both residing in Rust.

The good candidate was generated and retained. The principal degradation is accepted by a later objective. Next discussion: reuse the existing Rust local-proximity term in PostPlace or enforce a separate local-regression guard, evaluated on these same snapshots. Do not widen search or tune all weights as part of this audit. Portfolio's 1.19 gain is a separate, smaller concern.

## Artifacts and verification

- Interactive HTML: `debugging/rs485-stage-audit/index.html`.
- Image: `debugging/rs485-stage-audit/comparison.png`.
- Stage data: `data.json`; score evidence: `post-decomposition.json`, `crossing-pairs.json`, `pad-changes.json` in that directory.
- Reproduction: `node --import tsx debugging/rs485-stage-audit.mjs`; `node --import tsx debugging/rs485-post-decomposition.mjs`; `node debugging/build-rs485-report.mjs`; `node debugging/verify-rs485-report.mjs`.
- Report JS executed with a DOM stub, stage switching checked, SVG rendered to PNG and visually reviewed. No production tests rerun because production code was not changed.

## Follow-up implementation — pending user run

User authorized only the missing passive-pin stretch penalty, explicitly requested no runs, and deferred the full-local-score regression guard.

- Extracted the existing formula into `local_stretch.rs::penalty`: `w * (6*d + 32*max(d-3,0)^2)`. Block CPU, block GPU and PostPlace CPU/GPU call this shared implementation. Coefficients and the 3 mm knee are unchanged; the shared expression retains scalar Rust's multiplication grouping.
- PostPlace groups targets by connected IC and takes its nearest matching-net pad, recomputed for each pose. GND is excluded. Existing net weights apply, including 0.25 for supply nets.
- TS sends block/family ownership only; it does not calculate penalties. `attachTo` ancestry defines the family scope. ICs in unrelated scopes are excluded. Multiple connected ICs within one family retain the existing per-IC behavior; this does not solve the separate MCU-family target-addressing issue.
- Both native refiner input and the standalone score encoder carry the scope metadata. Missing metadata in historical raw captures means no added links; a new capture is needed to exercise the new behavior. The shared score-API compatibility version is now 2, so an old addon cannot silently ignore the change.
- The wiring-only board-alignment guard explicitly omits local scopes to preserve its previous objective. No full-local-score gate, weight tuning, search changes or threshold changes were added.
- Added unexecuted Rust tests for the existing distance knee/weights and nearest-pad selection, excluding other families and GND.
- Per user request: **no build, typecheck, tests, replay or placement run performed**. Source implementation is unverified. Before running the updated placer, rebuild using `npm run native:build`.
- No commit: pending the user's placement review.

## User-run follow-up: 2026-10-03T20-51-32-335Z

Read-only reconstruction of capture 73 confirms the v2 addon and populated rs485 scopes for U5/R14/R16. The new penalty is active: scalar native scores exactly reproduce the recorded swap, 1222346.875 → 1222088.5. C5 rotates before this swap, so the reconstruction includes that first move.

The swap still passes: effective improvement 410.50 → 257.25, above 100. Added stretch cost is 153.25 at full-score F32 precision. Isolated per-net deltas are +139.480 for +3V3, +10.526 for DE, +3.122 for TX (small summation differences are F32 rounding). DE uses the nearest U5 pad: U5.3 goes 2.216 → 3.343 mm, not the farther U5.2 at 4.571 mm. TX stays below the 3 mm knee: 2.165 → 2.685 mm. The unchanged -360 ratline-crossing tradeoff still wins.

R15's rotation is absent from the new accepted move list. The principal R14/R16 defect remains; this change is not accepted as a complete fix. No production changes or new placement run during this inspection. Evidence: `debugging/rs485-stage-audit/after-stretch.json`; reproduction script `debugging/rs485-after-stretch.mjs` only evaluates saved poses.

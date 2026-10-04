# ESPower regression audit — 2026-10-04

Read-only production investigation at `6a001c5`. Compared runs `2026-10-02T17-50-22-570Z` (revision a5c7ad0, dirty) and `2026-10-03T20-57-52-035Z` (6a001c5, clean). Resolved placement inputs and fixture sources are identical. The baseline dirty state prevents attributing all differences to a single commit without a version-controlled rerun.

## Confirmed stage boundaries

| Measurement | Baseline final | Latest native board output | Latest final |
| --- | ---: | ---: | ---: |
| L1.2–U11.1 | 4.270 | 17.543 | 17.470 |
| R21–U8 component centres | 5.264 | 19.494 | 19.494 |
| U1.1–L1.1 | 6.137 | 3.909 | 3.221 |
| R19.2–U13.4 | 2.213 | 1.558 | 3.446 |
| R20.2–U13.3 | 3.095 | 4.176 | 2.828 |

Antenna/current-monitor separation is already bad before final PostPlace. The last passive-pin penalty cannot directly explain those final-stage moves because they did not occur there. It also participates in local postrefine, so broader indirect influence has not been ruled out by this comparison.

## Controlled Board Package replay

Seven native GPU board-only replays using the current addon, unchanged production source. Inputs and solutions saved under `debugging/espower-regression-audit/`. No full placement pipeline or copper routing run.

| Input | L1–antenna | R21–U8 |
| --- | ---: | ---: |
| Old blocks, current relations | 4.196 | 5.287 |
| Above, only USB replaced by new | 2.702 | 6.308 |
| Above, only MCU replaced by new | 4.295 | 9.543 |
| Above, only monitor replaced by new | 4.196 | 5.925 |
| Latest input, only USB replaced by old | 4.295 | 4.976 |
| Latest input, only MCU replaced by old | 2.702 | 5.551 |

The additional unchanged-old-input replay also preserves the old broad layout (score 921302.5625 versus recorded 921334.5, not bit-identical). The problematic combination of block geometries, rather than wholesale loss of board relations, is causally implicated. These substitutions show sensitivity to known alternative shapes; they are not proof that a specific better pose was generated and rejected on the unchanged latest input.

## USB local context and portfolio

USB block area shrinks 196.76 → 169.65 mm². Old portfolio selected original/singles. Latest selects original/pairs and retains only pairs plus pairs+postrefine; those two differ solely by D1 rotation. The old spacious geometry is not available in the latest portfolio.

USB local problem contains relations U12.A7→R7.1 and U12.A6→R8.1, but no R7/R8 geometry: those belong to MCU. Thus local scoring lacks actual external data-path exits. In the latest final geometry both explicit USB path segments cross D1.1. Baseline was not clear either: USB path segments crossed U6 pads. This is a straight-segment obstacle diagnosis, not a claim about required vias or final routed quality. All original SVG lines should be interpreted with their ratline-rendering caveat.

`a15e413` replaced the old TS checkpoint objective with the existing Rust search objective; it was not a behavior-preserving language translation. Subsequent bypass pad-addressing and pair-seed changes also affect local solutions. Exact per-commit blame remains unproven. The old TS internal-block portfolio term was also removed at migration, but here the severe distance regression is already present at native board output, before portfolio selection.

## Existing weaknesses exposed by new geometry

- RF relation preserved: critical, maxDistance=9, hard=false, weight=432. `solver.rs::distance_limit_penalty` caps each relation's excess cost at 250000. With this relation weight the cap starts around 9.56 mm. At 17.54 mm, reducing distance somewhat does not reduce that capped term; linear distance and topology still remain. This is a plausible obstacle to escaping the poor layout, not a proven sole explanation of search trajectory.
- R21→U8 critical near preserved, but no maxDistance. A hard flag without a distance limit does not impose a finite near-distance constraint. This weakness existed in the baseline.
- Ordinary VIN+/VIN− board weights changed 0.1→1 under Rust classification. The old-block/current-relations replay does not reproduce the severe regression; the weight change alone is insufficient.
- Latest final PostPlace swaps R19/R20: one signal connection improves and the other worsens. R21→U13 pin distances remain about 4.27 mm. This is separate from global monitor displacement.

## Artifacts and limitations

- HTML: `debugging/espower-regression-audit/index.html`; old/new board PNGs beside it were rendered from saved SVGs and inspected.
- Measurements: `stages.json`, `path-hits.json`, `controlled-board-replays.json`, `reverse-board-replays.json`.
- Scripts: `debugging/espower-regression-audit.mjs`, `espower-controlled-replays.mjs`, `espower-reverse-replays.mjs`, `espower-path-hits.mjs`, `build-espower-regression-report.mjs`.
- Exploratory reconstructed board evaluation does not exactly reproduce latest hard rank (5 versus stored 3); do not use its absolute score as attribution evidence. Final report relies on recorded ranks, pose distances and complete native replay results.
- No production edits, builds, or commits. Shape substitutions alone do not establish a packer cause. Investigate selection on unchanged current blocks before proposing changes to local assembly.

## Follow-up: unchanged current blocks, R21 / MCU / antenna / crystal

Repeated the current board call once with the existing `PCB_BOARD_GPU_VERIFY_STAGES=1` diagnostic because reconstructed quality had failed to reproduce the saved rank. Captured native geometry now reproduces all three stage scores exactly through `evaluateBoardQuality`: beam 1190129; local_improve 1190129; repair 1190096.75. MCU below/right, antenna upper/right and distant current_monitor are already present after beam. Local improvement makes no change; repair translates MCU by 0.04 mm. This resolves the diagnostic score prerequisite using native snapshots, not a new evaluator; the earlier reconstruction discrepancy itself is not attributed to production.

Diagnostic single-block sweeps (integer-mm centres, four quarter-turns, other current blocks fixed) found no improving base-score pose for MCU, current_monitor or antenna without worsening hard rank. This bounded check is not a proof of global or continuous optimality and is not a proposed production search change.

A controlled alternative keeps every block's internal geometry unchanged, places MCU at centre (-4,-7), rotated 270 degrees relative to the recorded final board, temporarily fixes it during native repacking, then restores its original unlocked flag for evaluation. First probe at (-4,-6) overlapped USB by 0.4691 mm and was rejected as evidence; the corrected probe has the same hardCount=3 and hardSeverity=0.900049567 as baseline. Those three existing violations belong to the two fixed mounting primitives and a 0.00004959 USB boundary residual. No new mechanical violation is introduced by the corrected alternative; neither board is claimed absolutely hard-clean.

| Measurement | Selected | MCU upper alternative |
| --- | ---: | ---: |
| R21 centre–U8 centre, mm | 19.494 | 4.953 |
| L1.2–U11.1, mm | 17.543 | 7.397 |
| U12.A7–R7.1, mm | 5.681 | 9.632 |
| U12.A6–R8.1, mm | 6.900 | 9.899 |
| Native board base score | 1190096.75 | 1432774.25 |

Removing one relation at a time from each frozen geometry through the native evaluator measures its marginal contribution (including affected topology, not solely its direct distance term). Alternative minus selected: antenna -258674.81; USB D- +251421.63; USB D+ +250788.63; R21 near -1497.25. The two USB maxDistance=7 penalties outweigh the RF improvement. R21 `critical near` survives encoding but has no maxDistance; its direct distance cost is linear, approximately 102.86 units/mm. The RF excessive-distance term saturates at 250000 per relation. These facts explain why this specific mechanically feasible alternative loses the current objective; they do not prove that no better all-links layout was pruned.

The native output insertion order is MCU, antenna, current_monitor, charger, battery_adc after locked primitives. `relation_penalty` skips an endpoint absent from the placed subset: at MCU insertion the USB connector exists, while the antenna does not. Consequently future RF separation is not directly charged at that step. Later beam stages see it; the exact discarded branch is not logged. Local improvement moves one primitive at a time. This is a concrete search-context limitation, not proof of a specific candidate's elimination.

Crystal C4/X1/C6 already has perpendicular capacitors in local initial, survives pairs, and reaches board input as the same rigid configuration. Reconstructed block quality reproduces 1160.20984 exactly, including transformed routing obstacles. Small-block GND links exist: C4.2→X1.4 and C6.1→X1.2, normal weight70, maxDistance8. Their current lengths are 4.769/4.593 mm; signal links are critical weight240, lengths 1.929/1.753 mm. Removing both GND links reduces score by only 82.386; pad-crossing contribution is zero. Rotating one capacitor by ±90 at its current centre raises score to 1693–1731 despite reducing area. A diagnostic parallel-orientation repositioning probe yields score1343.220, area37.750 versus42.9997, signal lengths2.455/2.255 and ground3.942/3.787: shorter ground and smaller area still lose against signal geometry/other electrical terms. This limited probe is not a global optimality claim. The current hint requests proximity, not parallel orientation, and its 8 mm maximum is inactive in both layouts.

Artifacts: `current-trace.stderr`, `exact-{beam,local_improve,repair}.json`, `single-move-results.json`, `upper-2-unlocked.json`, `upper-comparison.json`, `crystal-probes.json` under `debugging/espower-regression-audit/`. Diagnostic scripts use existing native evaluators; production code, DSL, objective weights and addon remain unchanged. Three board-only calls in this follow-up: exact diagnostic replay, rejected overlapping upper probe, corrected upper probe. No full pipeline, build, tests or commit.

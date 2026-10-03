> Historical record. The compactness normalization described below was subsequently removed at the user's request. Current scoring ownership and replacement formulas: [Rust score authority](../rust-score-authority/README.md). Measurements below describe the earlier build only.

# Minimal block metric alignment — 2026-10-03

Baseline: `287bbf4`, whose tracked tree equals `c17fc73` after reverting `ba077f8`.
Scope: R13 and the three agreed scoring discrepancies. D3 is excluded; its DSL
critical-pair compromise is not a placer defect for this task.

## Changes

- Normal/power net spread and remaining long-pair costs use weights 1/0.25.
- Passive pads use the checkpoint IC-access term: nearest same-net pad of each
  connected main IC, `weight * (6*d + 32*max(d-3,0)^2)`. It replaces the old
  two-endpoint long-pair heuristic on those nets. IC-to-IC and passive-only
  two-endpoint links retain that heuristic. Existing `longNets` policy applies.
- For normal compactness, retain relative bbox/hull area and perimeter weights,
  normalized to 0.35 per mm² and 0.5 per width+height on a rectangular hull.
  Explicit high compactness, aspect penalties and target sizes are unchanged.

The complete search score is not replaced with the checkpoint score. Relations,
GND treatment, access/facing/corridor terms, collision geometry, search stages,
candidate generation, native contracts and Board Package are unchanged.
Existing net classifiers and checkpoint formulas are unchanged.

## Validation

The four initial numerical regression tests fail against the reverted baseline
addon and pass against the first narrow implementation. A fifth test protects
the existing IC-to-IC long-pair term. No large JSON fixtures are added.

Commands: `npm run typecheck`; `cargo test --manifest-path native/pcb-board-packer/Cargo.toml`;
`npm run native:build`; `node --import tsx --test tests/pcb-block-net-score.test.ts tests/pcb-block-quality.test.ts tests/pcb-block-search-stages.test.ts`.

Final checks: typecheck passed; Rust 99 passed / 5 ignored; focused TypeScript
14 passed. Native release build passed. Existing compiler warnings remain.

Saved CAN input: `debugging/pcb-layout/runs/STM32G0_CAN_RS485/2026-10-03T09-21-51-681Z/native/block/process-14216-thread-0/00052-can-af9fe0a5b3`.
`PCB_BLOCK_BACKEND=cubecl PCB_BLOCK_GPU_VERIFY=1` verified 68,390 scoring
candidates against CPU without fallback. Final CPU replay has identical states
and score 504.5516357421875, hardCount 0; R13–TX is 1.978455 mm.
GPU verification used the first narrow build; the final follow-up only preserves
the old IC-to-IC heuristic (not applicable to this CAN-only input).

Full capture: `debugging/pcb-layout/runs/STM32G0_CAN_RS485/2026-10-03T12-19-31-143Z`.
Native SHA256: `1a982455367c940cbc2dd514bcb034ba17aaf4c5bb1b784129e14a73e9a67dcf`.
The resolved input hash equals the earlier baseline:
`53cf2886c0a8f77e2c2380ba901d1c526651ce787494ff2f93137fbc8b544eb9`.
All 68 components placed, no physical overlaps or out-of-board components.
Wall time was 65.725 s versus the saved baseline's 77.640 s; this is one run,
not a controlled performance claim. Soft hint violations increased 11 -> 16.

| Final pad distance / orientation | Baseline | Narrow change |
| --- | ---: | ---: |
| R13.2–U4.1 | 7.480 mm | 3.242 mm |
| R8.2–U3.8 | 2.759 mm | 4.025 mm |
| X1.3–U3.8 | 6.150 mm | 7.439 mm |
| U1.3–R1.2 | 3.466 mm | 3.790 mm |
| U1.3–R2.1 | 2.335 mm | 2.261 mm |
| U4.7–J4.1 | 7.029 mm | 10.054 mm |
| U4 rotation | 270° | 180° |
| U5 rotation | 270° | 270° |

The selected local CAN block has R13–TX 2.094 mm; existing board post-place
increases it to 3.242 mm. The longer clock connection is already local to MCU;
the CAN rotation is already selected at board packaging.

Verdict: numerical scope and CPU/GPU agreement pass; whole-board quality does
NOT pass a no-regression gate. Do not present this patch as a board-quality fix.
No board/post-place changes or new acceptance rules were added to hide the
remaining regressions. Routing and bottom-layer usage were not measured.
Measurements: `debugging/minimal-score-alignment/{can-cpu,can-gpu,comparison}.json`.

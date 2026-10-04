# Family admission, passive release and pad access

## 1. Admission (2026-10-04)

Critical priority no longer implicitly hardens `veryNear` or non-core `criticalPair` in `expandHints`. Their Rust score profiles and authored distances are unchanged. Explicit `hard:true` on non-core pairs remains mandatory; core distance drift retains its existing x100 excess cost. Mechanical checks are unchanged. If no admissible checkpoint exists, the recovery geometry remains visibly an error, not an accepted score winner; named grouped anchors are retained for board repair.

Replay of saved ESPower `2026-10-04T12-06-25-597Z` MCU checkpoints 33/34/37/38: all eight checkpoints pass admission after this change; previously all failed. No search rerun or quality improvement is claimed by this admission replay.

Validation: typecheck and 7 unified-relation tests pass. The signal-path test expecting implicit hard admission was updated to the new contract. The cross-block RF integration assertion `report.ok` still fails; reproduced on original HEAD hints with the same native addon, before committing. Logs and diagnostic replay are in ignored `debugging/family-admission-*`.


## 2. Passive release

Production uses the passive-only hypothesis: ordinary two-pin R/C/L groups with passive/decoupling roles. Crystal/mixed groups, bypass/core islands, fixed parts, explicit row topology and local-layout primitives remain rigid. Unconstrained capacitor clusters still release: initially freezing these regressed Telemetry C33; the focused test caught this and the prior cap behavior was restored before commit. All eligible groups release together, then full Beam/singles/pairs, unchanged budgets.

Validation: typecheck; all 6 relaxed-group tests pass on CPU. Saved ESPower MCU subtree replay on CubeCL took 12.63 s: 12 admitted checkpoints, grouped/pairs selected (6567.83). Crystal stayed grouped; R12/R13 and R7/R8 released in the alternative. This experiment does not establish that passive-only release improves board quality. The subsequent cap eligibility correction does not affect this MCU, whose caps are bypass islands. Evidence: `debugging/passive-release-mcu.json`.

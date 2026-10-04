# Family admission, passive release and pad access

## 1. Admission (2026-10-04)

Critical priority no longer implicitly hardens `veryNear` or non-core `criticalPair` in `expandHints`. Their Rust score profiles and authored distances are unchanged. Explicit `hard:true` on non-core pairs remains mandatory; core distance drift retains its existing x100 excess cost. Mechanical checks are unchanged. If no admissible checkpoint exists, the recovery geometry remains visibly an error, not an accepted score winner; named grouped anchors are retained for board repair.

Replay of saved ESPower `2026-10-04T12-06-25-597Z` MCU checkpoints 33/34/37/38: all eight checkpoints pass admission after this change; previously all failed. No search rerun or quality improvement is claimed by this admission replay.

Validation: typecheck and 5 unified-relation tests pass. The signal-path test expecting implicit hard admission was updated to the new contract. The cross-block RF integration assertion `report.ok` still fails; reproduced on original HEAD hints with the same native addon, before committing. Logs and diagnostic replay are in ignored `debugging/family-admission-*`.

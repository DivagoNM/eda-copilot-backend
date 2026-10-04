# Family admission, passive release and pad access

## 1. Admission (2026-10-04)

Critical priority no longer implicitly hardens `veryNear` or non-core `criticalPair` in `expandHints`. Their Rust score profiles and authored distances are unchanged. Explicit `hard:true` on non-core pairs remains mandatory; core distance drift retains its existing x100 excess cost. Mechanical checks are unchanged. If no admissible checkpoint exists, the recovery geometry remains visibly an error, not an accepted score winner; named grouped anchors are retained for board repair.

Replay of saved ESPower `2026-10-04T12-06-25-597Z` MCU checkpoints 33/34/37/38: all eight checkpoints pass admission after this change; previously all failed. No search rerun or quality improvement is claimed by this admission replay.

Validation: typecheck and 7 unified-relation tests pass. The signal-path test expecting implicit hard admission was updated to the new contract. The cross-block RF integration assertion `report.ok` still fails; reproduced on original HEAD hints with the same native addon, before committing. Logs and diagnostic replay are in ignored `debugging/family-admission-*`.


## 2. Passive release

Production uses the passive-only hypothesis: ordinary two-pin R/C/L groups with passive/decoupling roles. Crystal/mixed groups, bypass/core islands, fixed parts, explicit row topology and local-layout primitives remain rigid. Unconstrained capacitor clusters still release: initially freezing these regressed Telemetry C33; the focused test caught this and the prior cap behavior was restored before commit. All eligible groups release together, then full Beam/singles/pairs, unchanged budgets.

Validation: typecheck; all 6 relaxed-group tests pass on CPU. Saved ESPower MCU subtree replay on CubeCL took 12.63 s: 12 admitted checkpoints, grouped/pairs selected (6567.83). Crystal stayed grouped; R12/R13 and R7/R8 released in the alternative. This experiment does not establish that passive-only release improves board quality. The subsequent cap eligibility correction does not affect this MCU, whose caps are bypass islands. Evidence: `debugging/passive-release-mcu.json`.


## 3. Pad-row access

`native/pcb-board-packer/src/pad_access.rs` owns eligibility, process dimensions, row profiles and CPU/CubeCL obstruction arithmetic. TS transports local footprint geometry, caches native profiles, rotates/translates rows with the component and consumes the native assembly margin. No new DSL fields.

- Track width 0.127 mm, copper clearance 0.254 mm, via land diameter 0.6 mm. Track channel 0.635 mm, via channel 1.108 mm; distinct via centres require 0.854 mm separation.
- Each connected SMD pad belongs to a perimeter side; central copper and holes are obstacles rather than extra signal-row demand. Different-net adjacent pad gaps determine density continuously. Every constrained pin contributes, not just one escape per package. NC pads remain obstacles but do not demand routing.
- Inward via positions are checked against all pad/hole rectangles, without implicit via-in-pad. Sites are reserved together so neighbouring pins cannot each claim overlapping via lands. Row depth varies from track-channel to via-channel depth depending on unavailable inward capacity.
- Row cost is obstructed area fraction times summed pin demand times 180. Wide obstruction of many pins costs more than blocking a small part of the row. Sparse rows have no additional density penalty, but IC/connector assembly margin remains. No blanket exemption for decoupling or power neighbours; their electrical proximity continues to compete through existing relations.
- Assembly minimum is board component clearance + 0.1 mm (0.35 mm for this ESPower). This replaces the old pin-count-dependent TS minimum and applies independently of soft routing cost. Explicit mechanical requirements remain.
- Block, Board full rank (including final quality/repair) and PostPlace use the same obstruction function. GPU kernels reuse the Rust/CubeCL arithmetic. No >20-component bypass, no high-compactness multiplier on access. Internal family pairs are also included in Board score.

Limitations: rectangular, perimeter-row congestion proxy; not a detailed router, BGA fanout or manufacturing proof. It samples one inward site per pin and reserves those sites greedily, so it can overestimate unavailable space. Outside via demand is represented by a soft row zone, not a complete allocation of all external vias. Body rectangles approximate neighbour obstruction; separate copper-layer/stack-up/via technology modelling remains future work. No automatic BGA or via-in-pad exemption. Footprint-specific unusual pin fields require visual review.

The old TS formulas lived in `report-helpers.ts`: connector exemption, 12/16-pin eligibility, `clamp((pins-8)*0.035,0.35,1.5)` and role discounts. They are retired, not combined with the new profile. The old Rust halo was `clamp((pins-8)*0.025,0.25,1.5)`, with role multipliers and a >20 component cutoff; it is replaced, not layered on top.

Validation: final native Rust tests 111 passed / 5 ignored; TypeScript typecheck passed. Focused native placement/F32/admission/passive-release/access tests: 49 passed / 7 optional GPU tests skipped; the two selected PostPlace GPU tests also pass separately. Synthetic rotating Block and Board CPU/CubeCL probes have identical ranks and states with GPU verification enabled, no CPU fallback. The same-geometry test checks identical obstruction cost on Block, Board and PostPlace. Final Windows addon SHA256: `822aedbcf0c121e62a28750842a5f2a360e97b401daeb215d7e05158e872748c`. Release compilation succeeded; its first copy hit EBUSY during a concurrent replay, then the built DLL was copied successfully after that replay ended.

Saved ESPower MCU subtree on CPU: 35.90 s, 12 legal checkpoints; grouped/pairs score 6859.92, grouped/singles 6915.92 retained. Raw score is not comparable with the previous metric because the access term changed. Full-board quality acceptance remains for the user's next run.

**Open GPU parity issue discovered by the broader MCU probe:** strict verification stops at candidate 536, CPU 10031666 versus GPU 10031846. New row access is identical on both: 159.09471130371094. The discrepancy is in the pre-existing pad-crossing calculation. Captured transformed R7/R8 pad bounds differ by 0.001 mm between CPU and GPU (e.g. R7.2 left/right CPU 2.381/3.245, GPU 2.380/3.244). CPU `prepared_pad_obstacles` and GPU template/translation have different rounding sequences; those transformation paths were not changed by this implementation. This is a separate unresolved parity issue, not a successful full-MCU GPU validation; no tolerance was loosened. Preserve it for the next focused fix rather than silently expanding this change. Diagnostic-only capture now includes component access geometry and score terms.

Local evidence (ignored): `debugging/pad-access-{cpu-verified-final,rust-final,post-verified-final,board-verified-final}.log`, `pad-access-{cpu,cubecl,mcu}.json`, `pad-access-failure-debug3.json`, `inspect-pad-coords.py`. The earlier RF `report.ok` baseline failure from change 1 also remains outside this scope.

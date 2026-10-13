# Remaining 0.4.0 placement tests — 2026-10-13

This is the historical audit before checkpoint `bc03b47`. A subsequent importer
and Git-history check corrected the RF classification: the manually supplied
U1 footprint excluded protruding pads, whereas the actual importer includes
them and the same body/pads pass the RF placement test. The following USB
findings describe the old binary. User-authorized minimal corrections and new
validation are recorded in [the follow-up](../release-0.4.0-minimal-fix/README.md).

Scope: classify USB, RF and Telemetry failures and update stale tests. No
placement/scoring code or fixture/DSL input changes. The previously authorized
empty/locked Board GPU guard is unchanged. No release publication.

Native Windows SHA-256:
`6e0be4128d1356f7eaf1d2ff49f9bd4b32e4d64496291cd56451b6370cfae8d1`.
Node 24.19.0; real GPU runs use NVIDIA RTX 3060 Laptop GPU. Generated inputs,
diagnostics and command logs are under ignored
`debugging/release-0.4.0/recovery/`.

## USB: one stale comparison, actual native issues remain

The bounded-neighbourhood test compared each current experiment against the
saved F64 `usb.solution.rank.hardCount`, rather than against the current solver
without that experiment. The current CPU baseline and all three variants return
hardCount 1; the historical baseline had 0. GPU baseline and those variants
return 0. The test now compares the same current input/backend with experiments
off and on, requiring that the variants do not worsen its hard count.

This change does **not** declare the current CPU baseline legal. A separate
`current USB baseline preserves mandatory geometry legality` test now requires
hardCount 0 for the current baseline, so the stale relative comparison cannot
hide its CPU violation. Combined/profile tests also still require hardCount 0.
Historical electrical quality measurements and fixture files remain unchanged.

| Current variant | CPU hardCount | GPU hardCount |
| --- | ---: | ---: |
| baseline, width 1 | 1 | 0 |
| extraPasses, width 1 | 1 | 0 |
| pairSwaps, width 1 | 1 | 0 |
| reinsertPair, width 1 | 1 | 0 |
| combined, width 4 | 0 | 1 |
| production profile, route off | 0 | 0 |
| production profile, geometric route | 0 | 1 |

The geometric GPU result has a measured R36–R37 primitive gap about
0.348999977 mm against 0.350 mm: near the 0.001 mm physical tolerance boundary.
Reconstructed output boxes are a diagnostic, not a replacement native scorer;
they do not establish the exact cause of every reported hard violation.
Block `hardSeverity` is currently always serialized as 0, so that value cannot
prove a violation is harmless. Keep the native zero-hard-count assertions.

Strict `PCB_BLOCK_GPU_VERIFY=1` also fails on the first baseline search candidate:
CPU score 20198864 versus GPU 20198764. This is an actual same-candidate numeric
disagreement. The verifier deliberately raises an error in diagnostic mode;
ordinary-mode replays complete. No verifier threshold was relaxed. Ordinary
mode was rerun because the failed strict pass could not produce final results.

Evidence: `usb-variants-cpu.json`, `usb-variants-cubecl.json`,
`usb-variants-cubecl.log` (strict failure),
`usb-variants-cubecl-ordinary.log`, `usb-cpu-final-audit.log`,
`usb-gpu-final-audit.log`.

## RF: feasible constraints, actual search failure

`tests/pcb-signal-path.test.ts`, the five-component cross-block RF path, authors
board clearance 0.5 mm. Current physical assembly allowance adds 0.1 mm for U1;
the required C1–U1 and U1–C2 gaps are therefore about 0.6 mm. The solver returns
about 0.35 mm. The shortfall is 0.25 mm, far beyond the 0.001 mm tolerance.

All signal-path limits pass. The invalid gap already exists at `01-v2-tree` and
persists through the final report. `rf_core` has zero admissible checkpoints and
returns its explicitly unaccepted recovery layout. This is not a stale report
expectation, a failed GPU recovery or an infeasible test.

Feasibility witness on the **same authored input**: translate final C1 by
−0.251 mm in X and C2 by +0.251 mm in X. The existing production report then
returns `ok=true`, with no overlaps and all signal-path limits satisfied. This
alternative is diagnostic evidence only; neither the fixture nor production
placement was changed. The RF success assertion remains intact.

Evidence: `rf-detail.json`, `rf-detail.log`, `rf-feasibility.json`.

## Telemetry: historical baseline is invalid under current clearances

The finishing-axis test supplied a frozen 2026-09-27 geometry and expected both
U1/U2 alignment within 0.15 mm and a completely valid final report. The baseline
already has **33 clearance violations** under the current assembly floor, e.g.
C48–U13 gap about 0.35 mm against required 0.45 mm. Those violations are present
before this test calls `refineBoardAlignment`.

The conservative pass evaluates 278 candidates. Rejections: 50 objective,
123 electrical score, 6 net length, 99 geometry. It accepts no moves and leaves
all poses unchanged; U1/U2 axis error stays about 5.073 mm. The pass is not a
general legalizer for an invalid historical board. Cosmetic alignment is soft
and must pass its electrical and physical guards.

The test now explicitly verifies that the historical baseline is invalid, that
alignment candidates reach the geometry guard, and that unsafe alignment is
rejected without changing poses, fixed components, C9's block-relative position,
electrical quality or hard hint magnitudes. Existing valid free-pair alignment
and collision/hard-hint tests remain intact. No frozen coordinates or clearance
rules were changed.

Evidence: `telemetry-detail.json`, `telemetry-detail.log`;
current policy documentation: `../channel-search/README.md`.

## Validation

Commands after test updates:

```text
PCB_BLOCK_BACKEND=cpu PCB_BOARD_BACKEND=cpu PCB_POST_PLACE_BACKEND=cpu
  node --import tsx --test --test-concurrency=1
  tests/pcb-block-experiments.test.ts tests/pcb-board-alignment.test.ts
  tests/pcb-signal-path.test.ts

PCB_BLOCK_BACKEND=cubecl PCB_BLOCK_SOLVER_PROFILE=1
  node --import tsx --test --test-concurrency=1
  tests/pcb-block-experiments.test.ts

tsc --noEmit
git diff --check
```

The CPU selection is logged in `remaining-cpu-updated.log`, the GPU selection
in `usb-gpu-updated.log`, and typecheck in `remaining-typecheck.log`.
Initial CPU selection: 34 tests, 33 pass, one RF failure, no skips; all nine USB
and all fifteen alignment tests pass. After adding the independent baseline
legality guard, the final CPU USB selection has ten tests: nine pass, one
baseline hard-count failure. Final GPU-requested USB: ten tests, eight pass,
two combined/profile hard-count failures. No skips. Typecheck and whitespace
checks pass. These focused checks do not constitute a new full-suite or full
cross-platform CI run.
Remaining release findings: native USB numerical/ranking differences and RF
placement clearance. Updating the two stale tests does not resolve these.

# 0.4.0 minimal USB/RF corrections — 2026-10-13

The user authorized a checkpoint commit before minimal corrections and full
verification, without publishing a release. Checkpoint: `bc03b47`.

## Changes

- Shared native CPU/GPU overlap checks compare edge separation rather than
  adding clearance to absolute coordinates. The 0.001 mm physical tolerance
  is unchanged. One relative F32 machine epsilon of the clearance accounts for
  rounding its subtraction; at 0.35 mm this is 4.17e-8 mm. Severity outside that
  boundary is not discounted. Placement-report overlap uses the same comparison.
- GPU block frame translation uses the first component's resident placement
  origin, as native solution serialization already does. Rounded bbox centers
  drift by 0.001 mm for half-grid edges at both zero and nonzero rotation.
  Moving candidates use the corresponding rotated placement origin. Full GPU
  scoring, shortlist, complete search stages and CPU replay remain in place.
- RF's manually supplied U1 footprint excluded protruding pads. Its helper now
  imports the same 4 x 3 mm body and original pads through the real EasyEDA
  importer. RF success and physical-clearance assertions remain intact. Saved
  USB/Telemetry fixtures and authored DSL are unchanged.
- Score contract v13 prevents loading pre-fix native binaries. No numerical
  weights, clearance policy values or runtime dependencies were changed.

## Baseline and verification

Before binary SHA-256:
`6e0be4128d1356f7eaf1d2ff49f9bd4b32e4d64496291cd56451b6370cfae8d1`.
The binary and existing seven-variant CPU/GPU results are retained under
`debugging/release-0.4.0/minimal-fix/before/`. Original input:
`tests/fixtures/block-placement/Telemetry/block-23.json`, upgraded only to the
current transport contract in memory. Real GPU: RTX 3060 Laptop GPU.

Focused Rust checks: GPU feature 99 passed, four hardware probes ignored; CPU
only 78 passed. Focused CPU USB/RF/Telemetry/geometry: 40 passed, zero failed,
one actual-GPU test skipped. The new boundary regression also verifies a real
violation beyond the floating roundoff allowance.

The first implementation using rotated bbox centers was rejected by strict
GPU verification: R36 at rotation zero retained a 0.001 mm translation error.
The placement-origin correction supersedes it. Rebuilds/replays after that
source change are required; failed diagnostic passes are not performance data.

Full-suite, actual-GPU, quality and target-platform validation are pending.
Generated commands, inputs and output remain in ignored
`debugging/release-0.4.0/minimal-fix/`. This intermediate record does not declare
release readiness.

## Skeptical review and before/after board replay

The review found a regression in commit `6d66e6e`: the GPU placement-origin
index used the electrical connection count, which excludes `@hint:` points.
Origins follow all stored points. The working-tree correction uses the full
connection-point count. The existing semantic-group/clearance GPU test failed
before that correction and passed afterward. This is a real introduced bug,
not a stale expectation.

The new strict USB GPU test still fails. An opt-in failure capture now includes
hard-count mismatches as well as score mismatches, without changing production
candidate evaluation. At search candidate 80, CPU and GPU scores both equal
10225314, but hard counts are 2 and 1. R33's CPU body has top/bottom
`-3.8029999733 / -1.9179999828`; GPU has
`-3.8039999008 / -1.9190000296`. The source template contains half-grid edges
`-0.9424999952 / 0.9424999952`. CPU rebuilds component bounds through rounded
rotation then translation; the zero-rotation GPU template preserves raw bounds
and rounds their final translated sum. Correcting translation origins alone
does not resolve this remaining geometry reconstruction mismatch. The failing
test is retained; the verifier and physical tolerance were not relaxed.

The shared clearance change is justified by an observed before/after centering
classification flip at the same physical gap. Its algebraically equivalent
severity formula changes F32 operation order, so identical search paths are
not promised. The GPU correction is necessary for the captured origin drift
but is incomplete. Small diff size is not evidence of release safety.

### Reproducible full-board comparisons

Use `debugging/release-0.4.0/minimal-fix/compare-complex-boards.mjs` with Node
24.19.0. Before uses checkpoint `bc03b47` and the preserved pre-change addon;
after uses `6d66e6e` plus the origin-index correction and opt-in diagnostic
capture. After addon SHA-256:
`b152d6e954f857dd986d0fa2e3618e477569ba20fef8bfbc328a266979892a02`.
Inputs are frozen byte-for-byte. All backends use `auto`; layout/subtree/board/
post worker settings are `1/0/2/2`. The runs are sequential without concurrent
GPU tests or native builds. Native logs confirm real GPU work. These compare
placement geometry and unrouted connection metrics, not completed PCB routing.

- RF: all 8 poses identical, no geometry violations, MST 39.78 mm in both.
- STM32G0 CAN RS485: 68/68 components, valid reports, no geometry or hard-hint
  violations in either run, all 9 existing fixture assertions pass. 54 poses
  identical; 13 move by 0.001–0.004001 mm and D3 moves by 0.2040005 mm. No layer
  or rotation changes. MST 653.62 -> 653.65 mm, critical-pair sum 197.03 mm in
  both, crossings 60 in both, foreign-pad intersections 103 in both. The 13
  pre-existing soft hint violations remain. Full times 114.35 -> 104.49 s;
  these single passes are not a general performance guarantee. Input SHA-256:
  `9fc531b67ae032ecf7077bcec9cef90be686b4876ef39931122199e9b052ca47`.
- Stepper: 85/85 components, no lost parts, no changed fixed poses, layers or
  rotations, no overlap/board-edge/region/layer violations in either report.
  72 poses identical; 10 move by at most 0.002001 mm, and R32/R33/C39 move by
  0.119001 mm or less. MST 1001.43 -> 1001.44 mm, critical-pair sum 76.91 mm in
  both, crossings 145 in both, foreign-pad intersections 181 in both. Full times
  149.49 -> 137.16 s. Input SHA-256:
  `267cbebf0c4b3975a39e2bca14649789d3511c8470b339912fc1ec9de875f6a6`.

Stepper's general `report.ok` is not sufficient to declare the fixture valid.
Replaying all 686 assertions from its existing fixture against each saved
result yields the **same six failures before and after**:

- Hard bootstrap link U10.2 -> C37.2: 4.3699998856 mm, limit 3 mm, unchanged.
- Required 0.34 mm screw-access margin: C2 0.2100 mm, C21 0.1899 mm,
  R4 0.0478 mm, R34 0.2179 -> 0.2169 mm, C43 0.2689 -> 0.2679 mm.

These failures predate this patch; they were not weakened or reclassified as
stale expectations. Two existing margins decrease by about 0.001 mm. All other
fixture checks, including motor face, mechanical datums, USB pad support and
antenna-notch pad support, pass. Thus no new failing assertion appears, but a
blanket claim that no metric worsened would be false.

`auto` scheduling used both CPU and GPU in each full run. STM32 GPU-admission
CPU fallbacks numbered three before and two after, with no panics; consequently
not every small pose difference can be causally assigned to the source patch.
The comparison covers production-mode outcomes rather than identical backend
scheduling. No routing or mechanical fabrication certification is implied.

Stepper logs contain three caught `compact_candidates.rs` bounds assertions
before and three after. Each transfers the original call to CPU; all four
full-board processes exit successfully. These are pre-existing fallback events,
not unhandled process crashes, and are not hidden by the visual comparison.

On the final reviewed Windows addon, `cargo test --locked --lib` passes 99
tests with four hardware probes ignored. Nine targeted Node 24 tests pass with
actual-GPU gates enabled: Block/Board without CUDA or Vulkan drivers; empty and
locked boards without GPU initialization; full CPU replay after Block singles,
each Board stage, and PostPlace failure; PostPlace absent-driver guards; and the
semantic-group origin-index regression. Log: `minimal-fix/recovery-review.log`.
The separately retained strict USB test fails as described above. Earlier full
CPU suite: 659 passed, zero failed, 37 skipped; it does not certify GPU parity.

Generated PNG/SVG images, complete reports, manifests, native logs and original
fixture assertion audits are under `debugging/release-0.4.0/minimal-fix/visual/`.
The interrupted ESPower baseline run was discarded because it competed with
GPU tests; no comparison or performance conclusion is drawn from that run.

**Verdict before the R33 follow-up: not cleared for release.** Passing full-board comparisons
cannot override the remaining strict USB geometry mismatch. Linux and macOS
CI for `6d66e6e` also does not certify the later working-tree correction.

## R33 follow-up — 2026-10-14

The authorized follow-up changes only Block GPU geometry preparation/transport
in `cubecl.rs`, `gpu_kernels.rs` and `gpu_frontier.rs`. CPU search, score terms,
candidate generation, physical tolerances, authored fixtures and test assertions
are unchanged.

1. Build the zero-rotation component template with the existing CPU geometry
   rebuild helper. CPU materialization rounds the source bounds before the
   translation even at zero rotation; retaining raw half-grid edges on GPU
   omitted that operation and caused R33's 0.001 mm body discrepancy.
2. Send the candidate's four primitive BBOX coordinates independently of the
   component-placement offset. CPU translates primitive bounds separately from
   rebuilding component bodies, so one offset cannot represent both exactly.
   This is coordinate packing, not CPU candidate scoring; the full score and
   shortlist remain on GPU. Account for the extra 16 bytes per candidate in
   score/frontier memory guards.
3. When the original collision envelope is exactly the primitive BBOX, refer
   to those current bounds instead of translating a duplicate static box from
   the component origin. Exact equality is required; distinct collision boxes
   retain their existing representation.

The first rebuild-only attempt resolved the original R33 hard-count mismatch
but strict verification then caught candidate 267 in `local_improve`: R32's
primitive BBOX/collision copy drifted by 0.001 mm, producing a 100-point score
difference with equal hard counts. Passing the BBOX alone left the stale
collision copy; both consumers had to be corrected. These failed attempts are
retained in the ignored diagnostic logs, and none changed the tolerance or
verifier. Rebuilds/replays were repeated because the source changed or the
preceding validation failed.

Final Windows addon SHA-256:
`8a5911c8aaf53002c6efdb542bdc08fe62a94a9a29975725b681fed29cfb4454`.
The previous reviewed addon `b152d6e...` is preserved as `r33-fix/before.node`;
the new addon as `r33-fix/after.node`.

Validation on this addon:

- Native default-feature tests: 99 passed, four hardware probes ignored.
  CPU-only (`--no-default-features`): 78 passed, none ignored.
- Native release build, TypeScript typecheck and package build pass.
- Focused CPU USB/experiment, RF signal-path, Telemetry alignment, geometry
  tolerance and Block post-refiner tests: 43 passed, zero failed, one dedicated
  Board GPU test skipped in this CPU-only invocation.
- All 14 Block GPU tests pass on the actual CUDA GPU, including the strict USB
  case, semantic groups, frontier/pruning, pair continuation, bounded batches,
  locked geometry, absent/disabled drivers and full-call CPU recovery.
- Six additional Board/PostPlace recovery checks pass: failures at every Board
  stage, disabled/missing drivers, empty/locked boards without initialization,
  and PostPlace replay with a fresh CPU time budget.
- All seven USB experiment/profile variants finish with zero hard violations
  and unchanged locked poses. Six supported variants use GPU with strict
  `PCB_BLOCK_GPU_VERIFY=1`; `profile-off` retains its expected unsupported-feature
  CPU fallback. Production `profile-geometric` verifies 719114 scored GPU
  candidates. No fixture or diagnostic tolerance was relaxed.

Commands, native logs, failure captures and saved results are under
`debugging/release-0.4.0/r33-fix/`. The focused strict test was followed by the
complete Block GPU suite; the latter includes that test again, not an additional
independent regression case. Full-board performance comparisons below use one
new run per frozen input and reuse the saved pre-fix runs.

### Full-board outcome of the R33 follow-up

Both runs completed successfully with the same frozen inputs and `auto`
backends, workers `1/0/2/2`, without concurrent tests or compilation.
The immediate baseline is the previous reviewed `b152d6e...` addon above.

| Check | STM32 before / after | Stepper before / after |
| --- | --- | --- |
| Components | 68 / 68 | 85 / 85 |
| Changed x/y/rotation/layer | **0** | **0** |
| Fixed poses changed | 0 / 0 | 0 / 0 |
| Geometry report violations | 0 / 0 | 0 / 0 |
| Existing fixture assertions | 9 passed / 9 passed | 680 passed, 6 failed / same |
| Hard hint violations | 0 / 0 | 1 / 1, identical |
| MST length, mm | 653.65 / 653.65 | 1001.44 / 1001.44 |
| Critical-pair sum, mm | 197.03 / 197.03 | 76.91 / 76.91 |
| Crossings / foreign-pad hits | 60 / 103, identical | 145 / 181, identical |
| Full wall time, seconds | 104.49 / 96.29 | 137.16 / 146.42 |

Every placement coordinate, layer and rotation is exactly unchanged, not just
visually similar. All saved quality metrics are equal. The original Stepper
assertions still fail for the same bootstrap distance and five screw-access
margins listed above; their magnitudes are unchanged in this follow-up. They
were not weakened, removed, or called stale.

STM32 has no panics and two GPU-admission CPU fallbacks in each run. Stepper
has three caught bounds assertions before and two after, plus the existing
admission/unsupported-feature CPU fallbacks; both full processes succeed.
Scheduling differs between `auto` runs. The single Stepper timing is 6.8%
slower than the immediate baseline, while STM32 is 7.8% faster. These are
single full-run observations, not proof of either a speed regression or a
performance improvement. No broad performance guarantee is made.

Reproduction/evidence:

- `r33-fix/compare-boards.mjs`: frozen input replay and binary/input manifests.
- `r33-fix/audit-saved-fixture.mjs`: existing fixture assertions against both
  saved outputs; Stepper's exit status 1 records the unchanged six failures.
- `r33-fix/render-complex.mjs`: shared-scale before/after SVG/PNG views, with
  actual fixture status visible in the image headers.
- `r33-fix/visual/{STM32,Stepper}/comparison.json`: exact pose comparison,
  reports, metrics and provenance. `original/` also retains the earlier
  checkpoint baseline; it was not re-run.

**Follow-up verdict:** the captured R33/USB CPU/GPU mismatch is fixed and the
requested Windows regression checks pass, with no new placement failure on
STM32 or Stepper. This does not mark Stepper's pre-existing fixture failures
as resolved or certify fresh Linux/macOS binaries: prior CI predates this
source change. No release, tag, main-branch push or publication was performed.

## BBOX-alias hull capacity follow-up (2026-10-14)

Logical review after the R33 checks found an introduced defect in the host
buffer-sizing path. `PRIMITIVE_BOUNDS` is the `u32::MAX` sentinel for a single
collision envelope exactly equal to the primitive BBOX. GPU `geometry_box`
already resolves it to that BBOX, but host sizing still iterated
`boxes..boxes + box_count` as if it were a geometry-array offset. The addition
panics with checked arithmetic; in release it wraps and skips the aliased box.
A fixed convex hull of 68 vertices plus four moving corners therefore received
only 64 candidate slots instead of 128. This was a real capacity defect, despite
the earlier small-block and full-board checks passing.

The fix extracts the existing sizing code into `cheap_hull_capacity` and
resolves the sentinel before indexing geometry. Ordinary stored collision boxes
retain their existing translation and rounding. The GPU kernels, collision
predicates, required clearances, tolerances, scores, pruning rules and search
stages are unchanged by this follow-up. This does not retroactively claim the
earlier clearance-boundary fixes left every numerical classification unchanged.

The Rust regression failed on the original sizing code with integer overflow
before the fix, then passed for alias-only, mixed and stored-only representations.
It also includes a containing moving box to verify that moving geometry is
excluded from the fixed hull. The real-GPU regression uses 64 fixed boxes on a
parabola and one moving box, runs actual pruning with `PCB_BLOCK_GPU_VERIFY_PRUNE`,
requires the CubeCL backend without fallback/panic, and compares the full result
with CPU exactly.

Validation of Windows addon SHA-256
`ca948fa13451eeb874c98ecada0d472ad36efb86ef3a7f6712a555290513fbd3`:

- Rust default-feature tests: **100 passed, 4 ignored**; release native build passed.
- Rust CPU-only tests (`--no-default-features`): **78 passed**.
- All **14 existing Block GPU tests passed**, including strict USB CPU/GPU
  verification, absent drivers and failure recovery. The added large-hull test
  initially had a missing required `powerComponent` fixture field and failed
  input parsing; after supplying `false`, its focused rerun **passed** on GPU.
  No solver code or assertion was changed for that test-input correction.
- **6 Board/PostPlace recovery tests passed**, covering missing/disabled drivers,
  failures at every Board stage, empty/locked calls without GPU initialization,
  and full PostPlace CPU replay with a restored time budget.
- TypeScript typecheck and `git diff --check` passed.

Logs and reproduction helpers are under
`debugging/release-0.4.0/r33-hull-fix/`. `red.log` preserves the failing Rust test;
`block-gpu.log` preserves the initial suite run rather than overwriting its
fixture failure; `large-hull-gpu.log` records the corrected test. The immediately
preceding `8a5911c8...` addon is retained as `before.node`.

### Full-board comparison after the hull-capacity fix

One new full run per frozen input was performed after rebuilding; the reason
for repeating the earlier board checks is the production capacity fix. No
tests or compilation ran concurrently with these placement measurements.
Inputs, `auto` backends and workers `1/0/2/2` match the preceding R33 runs.

| Check | STM32 before / after | Stepper before / after |
| --- | --- | --- |
| Components | 68 / 68 | 85 / 85 |
| Changed x/y/rotation/layer | **0** | **0** |
| Fixed poses changed | 0 / 0 | 0 / 0 |
| Geometry report violations | 0 / 0 | 0 / 0 |
| Existing fixture assertions | 9 passed / 9 passed | 680 passed, 6 failed / same |
| Hard hint violations | 0 / 0 | 1 / 1, identical |
| MST length, mm | 653.65 / 653.65 | 1001.44 / 1001.44 |
| Critical-pair sum, mm | 197.03 / 197.03 | 76.91 / 76.91 |
| Full wall time, seconds | 96.29 / 95.41 | 146.42 / 148.39 |

Every compared pose and all saved quality metrics are exactly equal. Stepper's
six failures retain the identical bootstrap distance and screw-access failures;
none of those assertions was changed. The shared-scale top/bottom images were
rendered and visually inspected, and the numerical comparison is saved in
`r33-hull-fix/visual/{STM32,Stepper}/comparison.json`.

STM32 has zero panics in both runs. Stepper still encounters the pre-existing
`compact_candidates.rs:52` bounds assertion (two caught occurrences before,
three after; the earlier `b152d6e...` baseline also had three). Recovery completes
the full calculation with the same output. This separate assertion is not
fixed or reclassified as harmless by the hull-capacity patch. The slight timing
differences in single runs do not establish a performance change.

**Scope of the result:** the BBOX-alias capacity defect is fixed, with no changed
placement or quality metric on the two requested boards and passing focused
USB/GPU/CPU-recovery checks. Known Stepper issues remain. Fresh Linux/macOS
build/runtime CI for this source is still required; Windows results do not
certify those platforms. No release, tag, push or publication was performed.

# Optional repeated-channel proposals and beam diversity

Experiment: 2026-10-07. User-authorized search changes and a small orientation
preference; distance, crossing, spacing and positional alignment weights are
unchanged. Placement score contract v11 requires a native rebuild.

## Search policy

- Reuse `SoftAlignment.pairs` (similarity >= 0.85). Generate rows only when
  adjacent authored signal-path ports connect the blocks to distinct paths on
  the same already locked target component (typically a connector). Sharing a rigid owner containing different
  connectors is insufficient. No fixture-specific part names.
- Generate the nearest pair and a group of up to 16 channels, ordered by
  actual pin coordinates. Try allowed rotations using existing orientation
  offsets, both connector sides, three gaps, direct pin projection or expanded
  envelopes, and common shifts of -1/0/+1 mm. Ownership stays independent.
- Reuse native transforms, physical checks, CPU/GPU rank and FastRoute. Joint
  proposals use full GPU ranks and safe lazy top-k, without the old preliminary
  route-blind shortlist. Retain four winners per placed inventory.
- Keep independent expansion, single-block axis proposals and local movement.
  Similar blocks at different connectors are not forced into adjacent rows.
- Compare partial scores only for identical placed inventories. Atomic groups
  use the existing deferred-depth mechanism. Different inventories share each
  depth's 32-slot budget deterministically. `searchWidth` remains 32; lookahead
  levels are deferred states rather than additional width at the same depth.

## Orientation and diversity

Native orientation weight is `4 / max(1, pairCount)` (4 without normalization).
The existing cosine formula, similarity and library-angle offset are unchanged;
the normalized total contribution is at most four points. Position weight stays
`1 / max(1, pairCount)`, tolerance 0.15 mm. Generation works with weight zero.

Keep the best half of each inventory's beam by full score. Reserve the other
half for different layouts of similar blocks, or the latest primitive if none
are placed: 0.75 mm cells plus discrete rotation. Diversity cannot worsen the
best hard-count/severity class and uses a 1,000-point soft-score window. Fill
unused slots in score order. Fine shifts survive among elites and fill entries.
This is soft exploration, not approximate deduplication or guaranteed rotation
coverage. Cell boundaries can classify nearby points as different.

## Limits

- Requires explicit paths to locked connectors; ordinary nets alone and paths
  to unplaced components do not trigger rows. At most 16 channels per group.
- No guarantee of mixed-rotation/staggered rows, swaps of already placed blocks,
  interlocking shapes, or global optimality. Independent candidates remain.
- Ordinary singles retain their existing 32+16 preliminary shortlist; safe
  route selection here applies to joint candidates only.
- Conflicting DSL priorities remain meaningful. Saved ESP32 retains near(U11,
  J5); the user's newer fixture edit disabling it is preserved, not replayed.

## Evidence protocol

Local artifacts: `debugging/channel-search-2026-10-07/`. `replay.cjs` records
input/native SHA-256, six workers, auto backend, stage logs and wall time. Frozen
Board captures: ESP32 15:10, STM32 15:07, Portable Telemetry 08:13 (2026-10-07).
Refresh only native default alignment policy, retain width 32 and saved geometry.
These are Board replays, not full-pipeline timings or successful full placements.

`report.mjs` uses existing rendering/metrics and a native intersection predicate.
Straight-line explicit crossings are diagnostic, not FastRoute or routing DRC.
The first GPU test exposed the old 96-slot shortlist API guard; use the existing
untruncated GPU rank mode instead. The guard was not weakened. Rebuild/retest
after this failure is a required correction, not a repeated performance sample.

Focused native/alignment TypeScript suite: 26 pass, one failure in the old
Telemetry finishing-axis assertion. The same assertion fails with `before.node`.
Expanded Board GPU suite: 29 pass, two skipped, two failures also reproduced
with `before.node`: the synthetic CPU-budget case reaches the old repair
shortlist guard, and the fully locked case initializes a runtime unnecessarily.
`before-adapter.cjs` only bypasses the new loader's score-version gate for these
baseline tests; it does not modify native behavior. None of these existing
assertions was weakened or removed.

## Frozen-input results: first tested revision (`after.node`)

All six replays selected CubeCL (CUDA runtime), with no fallback. Six workers,
width 32. One pass per board/build; timings are observations, not a speedup claim.

| Board | Before/after wall seconds | Before/after explicit crossings | Before/after explicit length mm | Native hard count |
|---|---:|---:|---:|---:|
| ESP32 | 68.81 / 68.62 | 22 / 16 | 529.24 / 524.32 | 6 / 6 |
| STM32 | 11.90 / 10.44 | 2 / 2 | 87.36 / 87.36 | 0 / 0 |
| Portable Telemetry | 83.14 / 83.87 | 7 / 7 | 347.05 / 347.05 | 5 / 5 |

ESP32 input-channel crossings: 7 -> 2, length 168.05 -> 162.92 mm. Output-channel
crossings: 2 -> 1, length 74.47 -> 74.68 mm. U8/U9/U10 now form a near row with
180-degree orientations; U7 remains at zero. This is an improvement, not a
crossing-free result or a finished fuse row. The generator emitted 592 retained
joint candidates across the beam; before it emitted none. ESP32 beam wall time
42.289 -> 42.280 seconds, local improvement 24.994 -> 24.672 seconds.

Hard severities are unchanged on all three boards. Total native scores:
ESP32 8699360 -> 8684268; STM32 6457.886 -> 6464.089; Telemetry 20565308 ->
20565334. The latter two are small objective regressions with unchanged measured
explicit connections; do not claim universally better scores or identical poses.
Default orientation weights also changed, so scores are not identical objectives.

The combined search changes were tested together; these measurements do not
attribute the benefit separately to joint generation, diversity or orientation.
Comparison, per-board metrics, full SVGs and ESP32 channel crops are in the local
evidence directory. Native SHA-256: before
`109fbf40f38e005b3137eeab84ed76aef1b1296098431d4d66c12568b2aa7ef9`, after
`eb70715e60b3ec65ab47d3ebcb2ea205e4ce242dc82a1d5e3837440c4a65c7f5`.

Validation: typecheck; 94 Rust tests pass (four ignored); rebuilt native addon;
the new four-channel CPU/GPU regression passes with zero orientation weight,
full intermediate-rank verification and no fallback. Broad-suite existing
failures are recorded above rather than reported as a green suite.

## Full current-DSL capture (first tested revision)

`npm run debug:pcb-layout -- capture ESP32_C3_MAN`, six Board/PostPlace workers,
subtree workers disabled. Output:
`debugging/pcb-layout/runs/ESP32_C3_MAN/2026-10-07T18-38-06-634Z/`.
320.21 seconds, 110 captured native requests, placement geometry valid. The
fixture still exits 1: D13.1--J4.4 is 11.605 mm, exceeding its 6 mm condition.
This is not a passing full-board acceptance result.

The user's current DSL disables near(U11,J5), unlike frozen-input comparisons.
U11 moves below the output fuses; F3/F4/F5 lie at y=-30 mm with 90-degree
orientations and F6 at y=-29.851 mm, also 90 degrees. The near-row of optocouplers
survives subsequent stages. This result combines the current DSL and search
changes; it does not isolate their effects. See `placement/channels.svg/png`.

Final review subsequently corrected per-inventory diversity quotas: allocate
the actual shared 32-slot budget before selecting elites/diverse entries, so
two inventories receiving 16 slots each do not accidentally retain only their
16 elites. A regression test covers this. The first revision remains archived
as `after.node`; final native replays are recorded separately, not substituted
for the binary used by this full capture.

## Final quota correction

Final addon SHA-256:
`1ea219733d7c4509a7119da8a315d4d70ae71dfa1d7b65ddcdbcac64126f9ea0`.
All three frozen-input solutions (complete states and ranks) are exactly equal
to the first tested revision above. Final replay wall times: ESP32 71.24 s,
STM32 10.43 s, Telemetry 86.09 s. Their original before times were 68.81/11.90/
83.14 s. Thus ESP32/Telemetry are about 3.5% slower in this final single sample;
do not present the first sample as proof of zero overhead. All select CubeCL
without fallback. See `final/` and `comparison.json`; `comparison-first.json`
preserves the first experiment. The changed quota policy justifies this new
version's replay. Rust tests and the four-channel CPU/GPU test pass again.

The final addon also replayed the Board request from the full current-DSL
capture: 69.63 seconds, CubeCL, no fallback. Its complete output is exactly equal
to the capture's original Board solution (`final/FullESP/capture-comparison.json`).
PostPlace/finishing code is unchanged. This connects the archived full-pipeline
preview to the final Board implementation without claiming a second full run.

## Follow-up: why U8/U9/U10 do not simply rotate by 180 degrees

`rotation-audit.cjs` reuses the saved F32 rigid-transform diagnostic and the
archived final addon. Reconstructed current-DSL Board baseline exactly matches
the captured rank 8684891 (hard 6, severity 8.60007858). Test all seven subsets of
U8/U9/U10 rotating their complete blocks about either bbox or chip centers.
All tested variants have worse full ranks. Bbox rotation of U10 alone adds no
hard violation and improves FastRoute by 207.15, but worsens total score by 9023.

| U10 link (native Board stage) | Current mm | Whole block +180 degrees mm |
|---|---:|---:|
| J4.4--R24.1 (input path) | 22.781 | 13.140 |
| U10.4--U6.7 | 26.341 | 15.795 |
| D13.1--J4.4 (authored max 6 mm) | 12.584 | 21.509 |

Native ablation excluding route shows D13--J4 cost rising approximately
1679 -> 19083 (+17404), U10--U6 falling 7636 -> 295 (-7341), input-path link
falling 2058 -> 1372 (-686). These are F32 ablation measurements, not a duplicate
scorer; small rounding/interacting-path residuals are expected.
U8/U9 single bbox rotations also introduce clearance conflicts: U8 with J4
(0.149 mm severity) and U9 (0.125), U9 with U10 (0.026). Rotating all three
retains the U8--J4 conflict. Chip-pivot rotations are worse as well.

`final-rotation-audit.mjs` separately checks the actual final placements using
the existing PostPlace encoder/scorer and native change validator. Baseline
score 124970.914; U10-only 131713.391; all three 136691. All seven modifications
are rejected by the native change validator. These are PostPlace scores and
must not be compared numerically with Board scores.

The initial four-channel cap was a conservative lookahead budget, not an algorithmic
necessity or the source of this particular failure: ESP32 has four DI channels.
Generation tries up to 144 raw patterns per group size (four common orientations,
three gaps, two sides, two spreading modes, three shifts), 288 for pair plus
four-channel proposals at one parent before deduplication/legality. Only four
fully ranked winners per inventory are forwarded. The current-DSL Board run
retained 916 joint candidates overall. It does not exhaust mixed rotations or
all row positions. A common zero-degree orientation is represented, but a
simple reversal of the observed blocks is not a better current objective.

Increasing orientation budget 4 -> 80 means per-pair coefficient 0.174 -> 3.478
for 23 pairs, not an 80-point reward per block. The first exact-input replay
keeps all four optocoupler angles/positions. It exposes the previously recorded
Board repair bug: an all-candidate request above 96 went through shortlist and
triggered full CPU replay. CPU recovery completed (rank 8684908); its 428 s wall
time includes failed GPU work and concurrent compilation, not a clean performance
measurement. Fix repair to reuse `gpu.ranks` for the full batch, preserving all
candidates and the existing rank/route evaluator. No orientation default or
other weight is changed by this fix.

Fixed-build replay (`orientation80-fixed/`) completes on CubeCL without fallback
in 77.91 seconds. Its complete solution is exactly equal to the CPU recovery
solution, including rank 8684908 and all placements. Native addon SHA-256:
`bb91f06bb0863b9cb94536e14cf333619e33bb457feb119944b20b04fcef1f20`.
Validation: 94 Rust tests pass, four ignored; both focused GPU tests pass
(whole-input CPU recovery at every stage and preserving the CPU worker budget
while using GPU). This is a native Board replay, not another full pipeline run.

## User-approved group limit extension: 2–16 channels

Raise the joint-group cap from four to 16; the potential extra runtime and memory
cost is explicitly accepted. Generate the nearest pair plus the full eligible
group capped at 16, not every subset or every intermediate size. Independent
placement, beam width 32, four fully ranked winners per inventory and the
orientation budget of four remain unchanged. Groups above 16 retain the anchor
and its 15 nearest peers. The pattern count per group stays the same, but each
pattern carries more geometry and may advance more deferred search levels.

A native generator regression exercises five, 16 and 17 eligible channels,
including pair fallback, unique membership and nearest-peer truncation.

Validation: `cargo test --manifest-path native/pcb-board-packer/Cargo.toml`
passes 95 tests (four ignored); native build and TypeScript typecheck pass.
Five focused TypeScript tests pass: four- and 16-channel CPU/GPU searches
(complete solutions equal, zero hard violations, no GPU fallback), default
alignment normalization, whole-call recovery and CPU worker-budget retention.
See `cap16-rust-tests.log`, `cap16-gpu-tests.log`, `cap16-build.log` and
`cap16-typecheck.log` in the local artifact directory.

The exact saved current-DSL ESP32 Board input replays on CubeCL without fallback
in 82.84 seconds; complete output is identical to the previous four-channel-cap
baseline (hard 6, severity 8.60007858, score 8684891). This is slower than the
earlier 69.63-second single sample; it is not evidence of unchanged performance
or a controlled attribution of the difference to group size. Existing ESP32
layout limitations remain. This is a native replay, not a new full pipeline run.
Artifacts: `cap16/FullESP/` and `cap16-replay.log`; addon SHA-256:
`7a74e407fb0c23f586a9a1ac4a7c3629f1ee8a592ae431ac9420e7f985b55ff2`.

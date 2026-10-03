# Layer-aware Board Package slots and edge validation

Date: 2026-10-03. Fixture: `PortableScope`. This work leaves the fixed U6/RF1/SW5
mechanical model and fixture/DSL inputs unchanged.

## Reproduction

Saved run: `debugging/pcb-layout/runs/PortableScope/2026-10-03T06-35-29-843Z/`.
Exact native call: `native/board/process-21496-thread-0/00196-board-dc03a91ccd/`.
Input SHA-256: `dc03a91ccdcce5e9538cce710a4624a5ccfb463bf74dce3be74dd848e37a4847`.
Baseline addon: `6571c7ed50a02b9a6945bc03acbba253a9492dcd62be4daa94dd092f7276b1ec`.
Baseline native call: 74.024 s, rank hard count 7, severity 19.880692.
The original complete pipeline took 419.755 s; native replays below are not
measurements of the complete pipeline.

The final baseline report contains four movable overlaps involving J1/J2 and
the buttons, two fixed overlaps (U6–RF1, U6–SW5), and edge errors for C26/C77.
The native hard count counts primitive pairs rather than component pairs and
also includes three fixed-component edge violations, which the report skips.

## Cause and change

J1/J2 have a 5.08 mm bottom body and a 4.24 mm top pad envelope. The top corridor
between the buttons and display can accommodate the pads with 0.35 mm clearance:
the allowed X interval is approximately `[-50.9281, -50.7540]` mm. Flattening
occupied rectangles across the two layers and fitting the complete 5.08 mm body
eliminated that corridor. Grid snapping could then erase a valid contact position
even at a 0.1 mm grid. Repair used the complete two-face bounds and overshot it.

The original coarse beam portfolio remains unchanged. During local improvement,
primitives with different envelopes on both faces gain additional candidates by
subtracting forbidden **centre positions** computed separately on each layer,
including each envelope's offset from the common packing centre. Contact slots
retain micrometre precision instead of snapping to the coarse search grid.
The existing gridded proposals remain available. Final native hard checks and
monotonic local ranking still decide legality and acceptance.

Repair offers actual same-layer contact separations in both directions. It also
retains whole-block escapes for compound blocks: clearing just one contact can
expose another contact without reducing the primitive-pair severity.

C26/C77 had about 0.5007/0.5009 mm body clearance to the board edge. Their complete
footprint bounds, including decoration, had only about 0.4504/0.4765 mm clearance.
The report and post-place validator now use the board packer's existing body plus
opposite-face occupancy representation. Real body/pad edge violations and the
existing polygon/overflow checks remain active.

## Checks and intermediate evidence

- `cargo test --manifest-path native/pcb-board-packer/Cargo.toml`: 99 passed,
  5 intentionally ignored GPU/environment-dependent tests.
- Regression coverage: fine candidate generation finds a legal
  0.1741 mm corridor on a 1 mm grid; repair reaches it; moving the wider body
  to the obstacle layer still produces a real collision.
- Native CPU and actual CubeCL CUDA corridor solves both reach hard count zero,
  with GPU score/shortlist verification enabled and no fallback.
- Report checks cover both layers and four rotations, and retain body and
  through-hole pad edge violations. Native post-place validation covers the same
  body/decorative-bounds distinction and a real pad violation.
- Final focused TypeScript run: 54 passed, 23 skipped, 1 failed. The failure is
  `empty and fully locked calls report CPU without GPU initialization`:
  `Control::set_phase` unconditionally calls `gpu::with_session` to trim idle
  allocations even when there is no GPU work. This function and the all-locked
  stage transition are unchanged from HEAD. The test's output placements match;
  the unexpected runtime initialization causes its log assertion to fail. This
  separate GPU lifecycle issue was not changed or hidden by weakening the test.
- Six final explicit CPU/CUDA regression tests passed: narrow corridor on both
  backends, board full candidate parity, compound geometry, edge validation,
  and post-place GPU score/selection parity. GPU checks use actual CUDA with
  score/shortlist verification; no fallback was observed.
- `npm run typecheck`, `npm run build`, `npm run native:build` passed. Native
  solution transforms also validate through the TypeScript adapter for all
  28 saved board roots.

An intermediate broad change applied centre-space slots to all primitives.
Its one exact CUDA replay took 103.982 s, rank hard count 6 / severity 20.319897.
J1/J2 and the edge reports were fixed, but J5 acquired overlaps with the DDR
regulator block. That version was rejected. A second version limited this replacement to
mixed-face primitives and restored whole-block repair escapes. Its CUDA replay
was 99.782 s, hard count 6 / severity 21.563896, with a new J1–USB-block collision.
It was also rejected. The final policy supplements coarse proposals only during
local improvement; beam candidate generation remains exactly as before. Each
repeat uses changed code, not repeated sampling of the same variant.

Ignored diagnostics: `debugging/scope-mechanical-2026-10-03/` contains build/test
logs, baseline and corrected isolated J1/J2 probes, and a replay/report comparison
script. Isolated probes freeze every other final primitive and remove electrical
relations; they prove the available slot, not complete-board placement quality.

## Final CUDA replay

Addon SHA-256: `cefba68ae952144645a42c22b0e741c21d296397767706abfd843eb60e45ec39`.
Output: `debugging/pcb-layout/replays/board/2026-10-03T08-19-50-872Z-board/`.
Actual backend: CubeCL CUDA, RTX 3060 Laptop GPU, six CPU slots, no fallback.

| Metric | Baseline | Final |
| --- | ---: | ---: |
| Native hard count | 7 | 5 |
| Native hard severity | 19.880692 | 19.188896 |
| Report component overlaps | 6 | 2 |
| Report movable edge errors | 2 | 0 |
| Changed authored fixed poses | — | 0 |
| Native call wall time | 74.024 s | 103.352 s |
| Beam candidates / batches | 4,420,614 / 1,978 | 4,420,614 / 1,978 |
| Local candidates | 777,010 | 852,505 |
| Repair candidates | 970 | 6,070 |

J1 ends at `(-50.755001, -4.649000)`, J2 at `(-50.755001, 11.393000)`,
both bottom/270 degrees. R13 moves with J2. All four original connector/button
overlaps disappear without new overlaps. The only report overlaps left are
U6–RF1 and U6–SW5. Native count 5 additionally includes the three unchanged
fixed edge violations. Thus the report remains invalid for the explicitly
deferred mechanical reasons; this is not a claim that the entire board is valid.

Do not attribute the entire timing difference to candidate generation: beam
has exactly the same candidate/batch counts but took 78.800 s versus 56.741 s.
The baseline call ran inside a warmed complete pipeline, while replay starts a
fresh process; adaptive GPU queue state differs (reported final depth 8 versus
2). Local improvement took 23.280 s versus 17.022 s and repair 0.640 s versus
0.162 s. Added search does have a measurable cost; no speedup or equivalent
full-pipeline latency is claimed. No repeated unchanged-input timing samples
were taken to select a faster result.

## Final CPU replay

Output: `debugging/pcb-layout/replays/board/2026-10-03T08-22-13-657Z-board/`.
Explicit CPU F32, six workers, same input and addon. The complete solution JSON
is identical to the final CUDA solution, including all states and rank values.
Report comparison also confirms no changed fixed poses, no new overlaps, and
no movable edge violations.

Observed call time was 568.069 s (beam 340.268 s, local 223.434 s, repair
4.280 s). Focused tests were run during part of the CPU replay, so this is
correctness evidence, not an isolated CPU/GPU speed comparison. The full
PortableScope DSL pipeline was not rerun; these are exact Board Package replays
plus report, transform-adapter, and post-place-validator checks.

## Commands

```powershell
cargo test --manifest-path native/pcb-board-packer/Cargo.toml
npm run native:build
npm run typecheck
npm run build
$env:PCB_BOARD_BACKEND = 'cubecl'
$env:PCB_BOARD_PACKER_PROFILE = '1'
npm run debug:pcb-layout -- replay debugging/pcb-layout/runs/PortableScope/2026-10-03T06-35-29-843Z/native/board/process-21496-thread-0/00196-board-dc03a91ccd 1
$env:PCB_BOARD_GPU_TESTS = '1'
node --import tsx --test tests/pcb-board-gpu.test.ts tests/pcb-board-packer-native.test.ts tests/pcb-board-spacing-layers.test.ts tests/pcb-existing-placement.test.ts tests/pcb-post-place-refiner.test.ts
```

# GPU parity coverage by constant mutation, 2026-10-19

Question: would the opt-in GPU tests notice if a scoring weight in a GPU kernel drifted from its CPU copy? The block, board and post-place kernels repeat the CPU constants, so a one-sided edit would only be caught by a CPU/GPU comparison that exercises that term.

Method: raise one GPU-side constant by about 10 %, rebuild the addon, and run `tests/pcb-block-gpu.test.ts`, `tests/pcb-board-gpu.test.ts`, `tests/pcb-geometry-tolerance.test.ts` and `tests/pcb-post-place-refiner.test.ts` with `PCB_BLOCK_GPU_TESTS=1 PCB_BOARD_GPU_TESTS=1 PCB_POST_PLACE_GPU_TESTS=1`. Revert the constant after each run. The tests already require `"backend":"cubecl"` and no fallback, and `PCB_*_GPU_VERIFY` compares every candidate with the CPU, so a detected mutant fails with a score mismatch such as `CPU=2095.7454 GPU=2103.7283`.

Host: Apple M5 Max, Mesa KosmicKrisp Vulkan driver. A local, unpublished change let CubeCL select Vulkan instead of Metal on macOS; it is not part of this change. Baseline with the existing tests: 82 pass and 2 skipped (CUDA only).

| GPU constant | Existing tests | With the new fixtures |
|---|---|---|
| Block bbox area (normal) | caught | caught |
| Block same-net signal spread | caught | caught |
| Block ordinary nets (normal) | caught | caught |
| Board perimeter (`high`) | caught | caught |
| Board ordinary nets (normal) | caught | caught |
| Block ground spread, blocks of 5+ components | **missed** | caught |
| Block external-port exposure (`high`) | **missed** | caught |
| Block port facing (`high`) | not run | caught |
| Block hull perimeter (`high`) | not run | caught |
| Block power yield (`high`) | not run | caught |
| Block net weight (`high`) | not run | caught |
| Board edge bias (normal) | **missed** | caught |
| Post-place detour, `flexible` path | **missed** | caught |
| Post-place turns, `flexible` path | not run | caught |

Causes of the misses: every block GPU fixture used `compactness: "normal"`, none had a ground net in a block of five or more components, no board primitive reached the 5.5 % area threshold for edge bias, and post-place paths were always `straight` (22/18 weights, never 8/5). A synthetic relation to an absent pad did not activate the port terms; the captured USB block does.

Change, tests only:
- Block: the composite block gains a fifth component, the ordinary bus and a GND net, run with both compactness values; the captured `Telemetry/block-23.json` block also runs with `compactness: "high"`.
- Board: two primitives, one covering 8 % of the board, in both compactness values.
- Post-place: the full-score test runs with `straight` and `flexible` paths.

Without the GPU flags these tests are skipped, as before; CI has no GPU. The GPU runs above were made on `main` 4de019f, which has the same native code and tests as the base of this change. With the flags, all four files pass on the GPU (18 + 35 + 6 + 28).

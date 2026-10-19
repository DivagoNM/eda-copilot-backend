# Speculative parallel pair neighbourhood, 2026-10-17

Question: can the block pair stage (`pair_improve`) use the block's thread budget without changing any result?

Change: the pair loop is unchanged in order and acceptance. With `pair_threads > 1`, CPU only and tracing off, consecutive pairs are solved in batches against one state on worker threads, each with its own `prepare_context` (its caches are memoization only). The first accepted pair in input order wins; the later pairs of that batch are solved again from the new state, so the outcome equals the serial loop. A worker failure finishes the remaining pairs on the caller's context. `solveBlockPrimitivesBatch` gives each hypothesis `threads / hypotheses` pair threads, and a single hypothesis now also uses the batch API when `threads > 1`. With one thread (the MCP default of 8 subtree workers sharing a budget of 8) nothing changes.

Host: Apple M5 Max, 18 logical cores, macOS, Node 22.22.3, rustc 1.99.1. CPU-only addons (`cargo build --release --locked --no-default-features`; the macOS GPU build needs the Vulkan SDK). Native SHA-256 prefixes: before `c03388d7bf07c16b` (`9dd04c8`), after `b1d588bdfa079f86`.

## Exact replay of captured H743 block calls

Every captured block call of an H743 capture that runs the pair stage and takes at least 0.3 s serially, replayed with `solveBlockPrimitives` and with `solveBlockPrimitivesBatch([problem], n)`:

| Call | Primitives | Serial | 2 threads | 4 threads | 8 threads |
|---|---:|---:|---:|---:|---:|
| MCU pairs (`00019`) | 12 | 28.82 s | 19.90 s | 12.71 s | 8.82 s |
| MCU module (`00020`) | 5 | 4.27 s | 3.21 s | 2.21 s | 2.25 s |
| buck_5 (`00015`) | 12 | 2.43 s | 1.90 s | 1.32 s | 1.33 s |
| buck_9 (`00015`) | 11 | 2.07 s | 1.39 s | 0.90 s | 0.74 s |
| OSD (`00014`) | 5 | 1.16 s | 0.92 s | 0.74 s | 0.63 s |
| buck_5 module (`00016`) | 5 | 0.48 s | 0.39 s | 0.36 s | 0.46 s |
| baro (`00004`) | 7 | 0.54 s | 0.49 s | 0.45 s | 0.55 s |

All 21 parallel solutions are byte-identical to their serial solution (complete JSON, including checkpoints and pair seeds).

## Full H743 placement

`PCB_LAYOUT_SUBTREE_WORKERS=<s> PCB_BOARD_PACKER_THREADS=<b> PCB_POST_PLACE_THREADS=<p> npm run test:pcb-layout -- H743`, one pass each:

| Build | s / b / p | Wall |
|---|---|---:|
| before | 8 / 8 / 8 | 117.6 s |
| after | 8 / 8 / 8 | 118.1 s |
| before | 2 / 8 / 8 | 98.0 s |
| after | 2 / 8 / 8 | 91.4 s |
| thread overrides only (`perf/honor-thread-overrides`) | 2 / 16 / 16 | 93.0 s |
| thread overrides + this change | 2 / 16 / 16 | 84.5 s |

All 118 poses (x, y, rotation, layer) are identical in all six runs. The 8 / 8 / 8 runs give each block one thread, so they are expected to match. Board packing (about 33 s) is now the larger remaining stage.

## Tests

`tests/pcb-block-*.test.ts`, `pcb-relaxed-block-groups` and `pcb-board-packer-native`: 66/66 pass before and after. `cargo test --no-default-features`: 77 pass; `interval::tests::outward_bounds_survive_ftz_and_cancellation` fails identically on `9dd04c8`. Not measured: the GPU build (the parallel path is disabled while a GPU engine is active) and other fixtures. Detail profile counters of worker contexts are not merged into `[block-detail]`.

## Shared reference counts (2026-10-18)

Fifteen-board run (all `tests/pcb-layout` fixtures with a saved input, 2 / 16 / 16, default-feature build, CPU backend because no F32 Vulkan device was present). Configurations were interleaved and repeated three times because single runs of the same input differed by up to ±3 s, which is larger than some of the effects. Medians: `main` 604.9 s, this change 558.9 s (−7.6 %), with identical final poses on every board and pass. `rp2040_base` was slower, though: 22.5 s → 27.2 s.

The loss came from its four 8-primitive blocks, not the small ones. A temporary per-worker timer showed each pair taking about 2.5× longer inside a worker than on the calling thread (60 → 158 ms per pair on a 5-primitive block, 287 → 730 ms on the 8-primitive blocks). A fresh context on the calling thread costs the same as the warm one, so cold caches were not the cause. Wasted speculation was not either: a block with no accepted pair did not get faster. Every `WorkingPrimitive` clone increments about 20 `Arc` counters shared by all workers. Giving each job an unshared deep copy of the block (`unshared`, commit `69467da`) removes that contention. Deep-copying the worker's problem as well brought no further gain, so it is not done.

Five boards, same settings, median of two interleaved passes (native SHA-256 prefixes: `main` `e66e7da4f8ddc4f5`, this branch `cbe172198dac56a6`):

| Fixture | main | pairs, shared copy | pairs, unshared copy |
|---|---:|---:|---:|
| rp2040_base | 22.9 s | 25.8 s | 22.0 s |
| H743 | 91.3 s | 75.1 s | 75.0 s |
| ThunderF722 | 92.5 s | 72.4 s | 71.4 s |
| ICM20948_v2 | 68.0 s | 60.9 s | 56.3 s |
| dc-dc | 5.9 s | 6.0 s | 5.7 s |
| Total | 280.7 s | 240.3 s (−14.4 %) | 230.4 s (−17.9 %) |

Final poses are hash-identical across the three configurations and both passes; no board is slower than `main`. `Portable_AC_DC_Telemetry`, `STEPPER_CONTROLLER` and `esp32c3` exit with code 1 from their own fixture checks on `main` and on this branch alike.

Verdict: keep the unshared copy. Tests: `tests/pcb-block-pair-parallel.test.ts`, `npm run test:pcb` (481 pass, 0 fail) and `cargo test --manifest-path native/pcb-board-packer/Cargo.toml` with default features (100 pass, 4 ignored).

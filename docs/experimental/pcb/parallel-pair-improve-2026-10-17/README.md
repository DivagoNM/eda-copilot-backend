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

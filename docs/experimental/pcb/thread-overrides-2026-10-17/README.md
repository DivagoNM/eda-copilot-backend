# Explicit thread overrides above eight, 2026-10-17

Question: does an explicit `PCB_BOARD_PACKER_THREADS` / `PCB_POST_PLACE_THREADS` above the default `min(8, cores / 2)` change placement, and does it reduce wall time?

Host: Apple M5 Max, 18 logical cores, macOS. Node 22.22.3, rustc 1.99.1. Both addons were built with `cargo build --release --locked --no-default-features` (CPU only; the macOS GPU build needs the Vulkan SDK, which was not installed). Native SHA-256 prefixes: before `c03388d7bf07c16b` (`9dd04c8`), after `b31e5d1a6edfd2af` (this branch).

Command, one pass per configuration on the same input:

```sh
PCB_LAYOUT_SUBTREE_WORKERS=<s> PCB_BOARD_PACKER_THREADS=<b> PCB_POST_PLACE_THREADS=<p> npm run test:pcb-layout -- H743
```

| Build | subtree / board / post | Wall time | CPU user time |
|---|---|---:|---:|
| before | 8 / 8 / 8 | 112.1 s | 301.4 s |
| after | 8 / 8 / 8 | 108.0 s | 292.3 s |
| after | 16 / 16 / 16 | 104.8 s | 309.7 s |
| after | 8 / 16 / 16 | 93.2 s | 314.8 s |

8 / 8 / 8 matches what easyeda-copilot MCP sets on this host. With 8 subtree workers and a board budget of 16, each block solve gets 2 native threads instead of 1, so its hypotheses can run as a batch.

Placement result: all 118 component poses (x, y, rotation, layer) are identical across the four runs. Only `report.graphReport` differs, because it includes stage timings. `placement_ok` is false in every run, before and after (pre-existing fixture state).

Tests: `tests/pcb-board-packer-native.test.ts` and `tests/pcb-post-place-refiner.test.ts` pass except two GPU tests (19, 21) that also fail with the before CPU-only build. The board packer equality check across 1/2/4/12 threads now runs 12 threads instead of clamping them to 8 on this host.

Verdict: the default is unchanged. An explicit override above eight keeps the placement and, on this board, saved about 17 % with 8 / 16 / 16. A single pass per configuration; other boards and the GPU build were not measured.

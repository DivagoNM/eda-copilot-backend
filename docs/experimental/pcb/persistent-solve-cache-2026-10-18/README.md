# Persistent native solve cache, 2026-10-18

Question: can repeated layouts of one board, the usual DSL iteration loop, reuse block and board solutions across runs without changing any result?

Change: `NativeSolveCache` keeps its process-local LRU. With `PCB_NATIVE_SOLVE_CACHE_DIR` set (default unset, disabled), a memory miss also looks for a file in that directory, and every native result is written there. The file name hashes the existing complete key (numeric contract, operation, full encoded problem, signed-zero positions) together with the SHA-256 of the loaded native binary and `PCB_BLOCK_BACKEND` / `PCB_BLOCK_GPU_DISABLED`, so a rebuilt addon or another backend selection never reuses older solutions. Values are stored with `v8.serialize` (signed zeros and `undefined` survive) and written through a temporary file and `rename`. The directory is shared by subtree worker processes. Unreadable or missing files are misses.

Host: Apple M5 Max, macOS, Node 22.22.3, 2 / 16 / 16, native addon of `main`. Each row is one run, in order, with the cache directory emptied before the cold run:

| Fixture | No cache | Cold | Warm (same input) | One block changed (no cache / cached) |
|---|---:|---:|---:|---:|
| H743 | 91.0 s | 90.9 s | 8.6 s | 92.3 s / 38.9 s |
| rp2040_base | 22.8 s | 22.8 s | 2.2 s | 23.3 s / 2.4 s |

H743's change adds `placementClearance: 0.5` to `status_leds`. The cached run re-solves only that block (0.05 s of block calls) and the board packing that depends on it (29.7 s). rp2040_base's change (`buck_aux` `maxBboxWidth` 10 → 11) changes no native problem. In every row the final poses are hash-identical to the uncached run of the same input. The directory held 85 files, 684 KB, after both boards.

Not covered: concurrent writers on network filesystems, cache size limits (entries are never evicted from disk), and Windows (rename over an existing file).

Verdict: keep as opt-in. Tests: new persistent-cache case in `tests/pcb-native-solve-cache.test.ts` (shared between instances, signed zero, bound to the binary identity) and `npm run test:pcb` (481 pass, 0 fail).

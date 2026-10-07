# Shared physical geometry tolerance — 2026-10-07

## Policy

`native/pcb-board-packer/src/geometry_policy.rs` owns the physical distance
tolerance: **0.001 mm**, represented in F32. CPU and CubeCL compile the same
overlap, overflow, segment-side, crossing and segment/box functions. The TS
geometry/report layer mirrors the constant in `src/pcb-layout/f32.ts`; a native
contract test checks that both values agree. Placement score contract is **12**.

- A violation depth `<= epsilon` contributes zero. A larger depth contributes
  its **full** value, not `depth - epsilon`. Real intersections still trigger
  the existing hard counts and fixed soft penalties. No score weights changed.
- Cross products have squared-distance units. Segment-side classification uses
  `epsilon * segment length`, not a raw epsilon applied to a product of crosses.
- Proper route crossings exclude touching endpoints. Closed pad/obstacle contact
  uses slab clipping with bounds expanded by epsilon. These are distinct contact
  semantics with one physical tolerance.
- Block/Board bounds, collision boxes, condition violations, passive islands,
  pad/via clearance, PostPlace and TS placement checks consume the policy.
  Former TS/island allowance 0.005 mm and PostPlace edge allowance 0.010001 mm
  tighten to 0.001 mm. Polygon checks apply tolerance once, without first
  subtracting it from the requested edge clearance.
- Score comparisons retain their own thresholds. Sorting/`total_cmp`, exact
  locked poses, cache keys, interval bounds, integer identifiers, finite checks
  and zero direction checks are intentionally **not** approximate comparisons.
  An epsilon comparator is not a valid replacement for a transitive total order.

This is a physical tolerance, not a global machine-epsilon replacement and not
an assertion that every CPU/GPU intermediate candidate is now identical.

## Reproduced ESP32 failure

Original capture:
`debugging/pcb-layout/runs/ESP32_C3_MAN/2026-10-07T18-38-06-634Z`.
Block pair continuation:
`native/block/process-26588-thread-0/00077-digital_input_1-d3bd5deb4d`.

The saved pair solution is legal (`hardCount=0`), but its U7/D6 and U7/R19
primitive collision boxes have positive clearance depth about **5.96e-8 mm**.
The old strict-positive check adds two 10-million-point penalties. The same
poses, transformed and encoded through the production functions, score:

| Evaluation | Score |
|---|---:|
| Before | 20,002,110 |
| With shared tolerance | 2,109.8623046875 |

Area, electrical score, local stretch, wire length and port coordinates are
unchanged. The fix removes the false boundary penalties without moving parts.
This demonstrates the rejection bug; it does not promise an optimal final
board or a particular D10 rotation after all later search stages.

Local evidence is under ignored `debugging/digital-input-audit/`, including
`pair-exact.json`, `epsilon-pair-result.json`, test logs and saved native replays.

## Validation

Boundary regressions cover the original F32 boxes, 0.0005 mm permitted shortfall,
0.002 mm real violation, polygon-edge contact/overflow, translated and axis-swapped
boxes, dimensionally scaled segment predicates, and the native/TS epsilon contract.
GPU tests require the actual CubeCL backend and reject unexpected CPU fallback.

- `cargo test --manifest-path native/pcb-board-packer/Cargo.toml`: 98 passed,
  four existing ignored tests.
- `npm run native:build`, `npm run typecheck`, `npm run build`: passed.
- `node --import tsx --test --test-concurrency=1` with
  `tests/pcb-{geometry-tolerance,block-quality,f32-numerics,post-place-refiner,post-place-route-aware,board-packer-native}.test.ts`:
  47 passed, nine GPU-gated tests skipped in this CPU invocation.
- Explicit GPU selection covers boundary candidates, Block world bounds,
  semantic groups/pair continuation, Block/Board geometric routing, PostPlace
  full scores and pad-access rows. The invocation enables
  `PCB_BOARD_GPU_TESTS`, `PCB_BLOCK_GPU_TESTS`, `PCB_POST_PLACE_GPU_TESTS` and
  selects those names in the corresponding test files. See
  `epsilon-gpu-final.log`: **seven passed, zero failed or skipped** on the final addon.

Saved native replay, one thread, final addon SHA-256
`95c34921795aaec41c5a66d9e591a9657b456a4778c5f5cfc6e66963a88a81e3`:

| Exact input | CPU wall ms | GPU wall ms | Both final scores | Hard count |
|---|---:|---:|---:|---:|
| `00074`, SHA `06f4846d46850efc6393e43d14c52fbd4918a37ce6e768150fe8484933701d42` | 1501.59 | 18066.54 | 2247.184326171875 | 0 |
| `00077`, SHA `d3bd5deb4d23364b9b185e0ec615fbcab6c142d0c56883167b0d312362bda245` | 850.11 | 10824.31 | 2109.63671875 | 0 |

Both **complete solution objects** match between CPU and GPU; neither GPU call
fell back. GPU timing includes process/runtime/shader setup, and the first CPU
replay overlapped other CPU tests. These are correctness replays, not clean
performance comparisons or full-pipeline timings. No whole-board capture was run.

## Remaining intermediate-score discrepancy

Strict `PCB_BLOCK_GPU_VERIFY=1` stops the `00074` replay at candidate 0:
CPU **4783.3823**, GPU **4783.392**, phase `search`. The pre-change score-contract-11
addon `debugging/channel-search-2026-10-07/final.node` reproduces exactly the same
failure on the same input (SHA-256
`1ea219733d7c4509a7119da8a315d4d70ae71dfa1d7b65ddcdbcac64126f9ea0`).
This discrepancy is pre-existing and is **not fixed** by physical epsilon.
The score verifier was not relaxed. Matching final results does not close it.

After the failed strict replay, the GPU call was repeated in ordinary mode to
complete the saved-input comparison. A diagnostic attempt with the flag set to
`0` also failed because this flag is presence-based; the successful ordinary run
removes it entirely. Logs preserve the strict failure and baseline reproduction.
The native build was repeated after separating PostPlace score/distance constants
and adding the concave-notch guard; final evidence uses the last build.

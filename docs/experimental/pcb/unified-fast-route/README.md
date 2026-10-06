# Unified FastRoute objective

2026-10-06. Continues `5b05a90` (shared CPU/CubeCL geometric arithmetic).

The user authorized removing Micro-A* and using one geometric route objective
throughout placement. This deliberately changes the objective, unlike the earlier
GPU-only migration. Scores and winning layouts need not match the previous addon.

## Shared code

`fast_route/layout.rs` builds the full-layout route plan: a deterministic tree per
ordinary non-ground net, deduplicated authored connections, compatible layers,
foreign obstacles, and the existing seven path alternatives. Block external-net
escape terms retain their block context. The board and post-place have no block
boundary escapes. Stage geometry and non-route objectives can still differ.

`fast_route/plan.rs` packs path jobs and reduces their results in F32 order.
`fast_route/arithmetic.rs` supplies the same obstacle and crossing arithmetic to
native CPU execution and the CubeCL kernel in `fast_route/gpu.rs`. There is no
second GPU formula or Micro-A* fallback. This is a placement proxy, not a physical
router or connectivity proof.

Search uses base score as the lower bound and adds the full route score to exact
candidates. It no longer accumulates route penalties along the insertion history:
a moved obstacle or changed tree can reduce the full route score. Quality exports,
block checkpoints and final board ranks include the route term. Post-place accepts
against its complete score, including FastRoute, without a separate route gate.
The previous post-place straight-segment crossing/pad terms and block pad term
are removed from the objective to avoid double charging.

## GPU execution

Stage admission still selects CPU or CubeCL using the existing backend policy.
Within an admitted GPU stage, FastRoute dispatches substantial work to the shared
process GPU runtime; fewer than 16,384 estimated segment tests run on shared CPU
arithmetic. Post-place combines all route plans in a candidate chunk before this
decision. Board/block lazy ranking evaluates shortlisted layouts as needed.

Host planning, packing and ordered result reduction remain on CPU. Large batches
alone do not override an explicitly selected CPU backend, runtime unavailability,
or stage admission. Diagnostic quality exports are CPU calls. GPU errors propagate
to the owning solver, which discards the partial result and replays the original
call on CPU, with a fresh post-place timeout.

## Compatibility

Placement score contract is 6; rebuild the native addon. `routingMetric: micro`
is rejected. Legacy Micro-A* comparison APIs and their dedicated probes/benchmarks
are removed; `scoreFastRouteLayout` provides the canonical full-layout diagnostic.
Post-place move reports use `scoreBefore`, `scoreAfter`, and `effectiveImprovement`;
the obsolete separate Micro-A* job/feasibility fields are removed.

The separate `padCrossingWeight`/`padCrossings` controls and their old scorer/cache
are also retired. Old block captures contain a rejected `experiments.padCrossings`
field: remove that field in the replay input, preserving the original capture.
No authored geometry, constraint, budget or numeric coordinate needs migration.

## Validation

- Rust default features: 86 passed, 4 GPU-dependent/diagnostic tests ignored.
- CPU-only Rust build: 65 passed.
- TypeScript typecheck passed.
- Focused native/TypeScript suites: 49 passed, 8 GPU-only tests skipped.
- Five explicitly enabled real-GPU tests passed: block and board route parity
  and whole-call recovery, post-place full-score parity, batched FastRoute error
  recovery, and chunk-size/worker-count invariance.
- Rebuilt the release addon after removing obsolete scorers and accounting for
  host route preparation in the refiner's existing CPU worker budget.

Commands: `cargo test --manifest-path native/pcb-board-packer/Cargo.toml`, the
same command with `--no-default-features --lib`, `npm run native:build`, and
`npm run typecheck`. Native suites: `pcb-board-packer-native`, `pcb-post-place-refiner`,
`pcb-post-place-route-aware`, `pcb-pad-crossings`, `pcb-block-quality`, and
`pcb-local-island-regressions`. GPU checks enable `PCB_BLOCK_GPU_TESTS`,
`PCB_BOARD_GPU_TESTS`, and `PCB_POST_PLACE_GPU_TESTS` with test concurrency 1.

The C9 historical regression still rejects the damaging long-link move and
excludes it from the portfolio. Its complete-score difference is now 186.0483
(4812.0254 versus 4998.0737), so the obsolete assertion of a difference above 200
was replaced with the behavioral ordering assertion. The independent local
stretch, link-length, and portfolio rejection assertions remain.

## Single-pass native measurements

Release addon SHA-256:
`1b10e14212ec00b3e2fefe6798b3de37d45256286d9361b649bf8e84352eea4d`.
RTX 3060 Laptop GPU, CUDA, F32 live probes passed. Separate fresh processes;
six board CPU threads; no simultaneous builds or tests during measurement.
GPU timings include initialization and kernel preparation. These are native
stage timings, not an end-to-end board pipeline benchmark.

| Saved input | CPU | CubeCL | Outcome |
| --- | ---: | ---: | --- |
| STEPPER board, `00079-board-d352059ff9` | 26.396 s | 12.731 s | Entire CPU/GPU solutions identical; GPU 2.07× faster |
| STEPPER pd_controller, 9 components, `00028-pd_controller-46799d9c2f` | 1.958 s | 6.938 s | Both legal; cold GPU slower |

The board retains the previous capture's two hard violations and severity
3.3959963. It is not a clean board result. Placements changed from the earlier
objective, while CPU and GPU agree on the new complete solution. The previous
GPU implementation measured 15.078 s on this input, but that is a different
objective/search trajectory and is not a controlled arithmetic-only comparison.

Block CPU/GPU scores are 1035.92285/1035.92627. They choose globally quarter-turned
layouts, with relative coordinate differences at most 0.001 mm; both have zero
hard violations. Exact byte equality is asserted by the focused parity fixtures,
not claimed for this symmetric real block. Small route jobs retain CPU admission;
the forced CubeCL **stage** still pays cold runtime/kernel costs.

Original input hashes:

- Board: `d352059ff95adafa0f6c6ed7e754154e5fca48cef2cad126f99f9fa8029af25d`.
- Block: `46799d9c2f34cf03ab5a777e776fcf1fd1af1fa275f3273a9d9bac17c82d8667`.

Inputs remain in `debugging/pcb-layout/runs/STEPPER_CONTROLLER/2026-10-05T18-11-44-267Z/native/`:
`board/process-33896-thread-0/00079-board-d352059ff9/problem.json` and
`block/process-33896-thread-0/00028-pd_controller-46799d9c2f/problem.json`.
Ignored evidence lives in `debugging/geometric-gpu/unified-{board,block}-{cpu,cubecl}.{json,log}`.
`replay-unified.cjs` records original input and addon hashes and removes only the
retired block switch in memory. The first attempted block replay failed schema
validation before scoring because of that switch; it produced no timing result.
The successful CPU/GPU measurements were each run once. Verification builds/tests
were repeated after scorer cleanup and the CPU-budget correction, not to select
favorable performance samples.

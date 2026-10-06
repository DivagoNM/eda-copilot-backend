# Shared geometric route evaluation on GPU

Base revision: `5173790`. The `e0e1de4` board correction and the existing block
geometric correction previously ran on CPU after GPU shortlist evaluation.

## Implementation

`fast_route` builds one common evaluation plan for CPU and GPU. It retains the
same net skeleton, explicit connections, nearest-four alternatives, seven paths,
layer rules, ground policy, external escapes and board before/after obstruction
correction. Layer lookup is reused per skeleton and identical filtered obstacle
and crossing arrays are interned within a plan.

The CubeCL kernel evaluates the independent paths of a candidate in one batch.
CPU and GPU compile the same segment/rectangle, clearance and crossing arithmetic
from `fast_route/arithmetic.rs`. F32 addition order within a path is unchanged;
host expression reduction retains the original min, sum and positive-difference
order. Connection planning, path construction and final scalar reduction remain
on the host. The existing lazy candidate selection is unchanged: this does not
eagerly score all placement candidates or change search/quality budgets.

Board beam, local improvement and joint corrections share `board_plan`; block
beam/singles/pairs share `candidate_plan`. GPU execution follows the owning
solver's admitted backend and uses its shared process runtime and bounded queue.
Errors propagate into existing whole-original-call CPU recovery; there is no
partial candidate fallback. Final PostPlace is unchanged.

Small plans with fewer than 16,384 estimated segment tests (counting both pad
and clearance tests) stay on the same CPU evaluator. This is workload admission,
not error recovery: the parent solver continues using GPU for placement scoring.
An initial always-GPU version regressed the saved nine-primitive `pd_controller`
block from 5.923 s to 7.483 s despite identical results, motivating this floor.

Diagnostics are opt-in: `PCB_ROUTE_GPU_VERIFY=1` compares every path bitwise with
CPU; `PCB_ROUTE_GPU_PROFILE=1` emits path/job counts and elapsed batch time;
`PCB_ROUTE_GPU_FAIL=1` exercises full-call recovery. Normal runs do not emit a log
line per route candidate or run CPU verification.
`PCB_ROUTE_GPU_FORCE=1` bypasses the small-work floor for kernel tests. Profiling
reports CPU admission as `[geometric-route-cpu]` with the estimated work/reason.
The enclosing board `route.workerMs` now includes GPU waiting as well as host
preparation; it must not be interpreted as CPU utilization.

## Validation and measurements

Local commands, logs, exact-input replays and binary hashes are under ignored
`debugging/geometric-gpu/`. Timings from saved native inputs are native solver
measurements, not complete DSL-to-board pipeline timings. Cold compilation and
GPU availability must be considered separately from steady-state throughput.

Measured on the NVIDIA GeForce RTX 3060 Laptop GPU / CUDA, six board CPU workers.
Each native replay starts a fresh process, so initialization and kernel
preparation are included. Profiling was identical for the fresh old/new runs;
path verification was disabled for timing.

| Saved native call | Reference | Final implementation | Comparison |
| --- | ---: | ---: | --- |
| STEPPER board `d352059ff9` | 63.639 s | 15.078 s | 4.22x, fresh old/new replay |
| Telemetry board `fb403a0439` | 704.500 s | 92.420 s | 7.62x against historical capture |
| STEPPER pd_controller block `46799d9c2f` | 5.923 s | 6.965 s | cold small-block regression, not a speedup |

All three final solutions are exactly equal to their references, including all
states and ranks, and no GPU failure/replay occurred. The board calls retain
their original intermediate hard counts (STEPPER 2, Telemetry 5); this is not a
claim of final placement validity. The current kernel is visible in the shared
runtime's `geometric-route` queue class.

The small-block sample contains 5.909 s of accumulated first-launch preparation
versus 5.067 s in the baseline. The floor reduces the always-GPU regression but
does not establish a cold or warm block speedup. No full-pipeline speedup is
claimed. The Telemetry comparison is historical, not a second fresh old-addon
benchmark; its saved input and old-addon hash match exactly.

Before the admission floor, STEPPER GPU took 13.629 s and CPU took 43.001 s,
with identical outputs. These exploratory timings are retained separately and
are not substituted for final-version measurements. Final GPU replays were
repeated because the admission policy changed. An initial old-addon invocation
was rejected before solving because the harness had not decoded `$nativeNumber`;
it was corrected using the existing capture replay format and is not a timing.

Baseline addon SHA-256:
`49140de6a710a10b66117560e6e88a5ccaf538845d730d4a95f1cf0b70211e9e`.
Final addon SHA-256:
`27da9992dbdd4a192c845695989f7a1996a7303b3aee3b0c319f10c3f633be1f`.
Exact input hashes and comparisons are in `debugging/geometric-gpu/evidence.json`.

Checks: native release build; Rust unit suites with and without GPU support;
TypeScript typecheck and focused native tests; real GPU path parity, board/block
solution parity, small-work CPU admission and injected whole-call recovery.

- Final Rust suite: 111 passed, 6 ignored; CPU-only: 90 passed, 2 ignored.
- Real-GPU focused integration: 2 passed (including path verification and failure
  replay); standalone path test also passed for 896 paths.
- Typecheck passed. Broader native/F32 TypeScript selection: 12 passed,
  24 optional GPU tests skipped, 1 pre-existing failure. The failing test is
  `empty and fully locked calls report CPU without GPU initialization`:
  board phase cleanup initializes the GPU even when there were no candidates.
  It reproduces unchanged using the preserved old addon, recorded in
  `baseline-existing-failure.log`. This unrelated behavior was not changed.

Reproduction (from backend root):

```text
npm run native:build
cargo test --manifest-path native/pcb-board-packer/Cargo.toml --locked
cargo test --manifest-path native/pcb-board-packer/Cargo.toml --locked --no-default-features
cargo test --manifest-path native/pcb-board-packer/Cargo.toml --locked fast_route::gpu::tests::geometric_paths_match_cpu -- --ignored --exact
npm run typecheck
```

For integration, set `PCB_BOARD_GPU_TESTS=1` and `PCB_BLOCK_GPU_TESTS=1`, then run
`node --import tsx --test --test-concurrency=1 --test-name-pattern="geometric route GPU" tests/pcb-board-gpu.test.ts tests/pcb-block-gpu.test.ts`.
Saved native calls can also be replayed through the existing
`npm run debug:pcb-layout -- replay <capture-dir> 1` workflow with the desired
`PCB_BOARD_BACKEND` / `PCB_BLOCK_BACKEND` set before launching.

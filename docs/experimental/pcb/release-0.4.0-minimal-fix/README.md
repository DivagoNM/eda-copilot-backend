# 0.4.0 minimal USB/RF corrections — 2026-10-13

The user authorized a checkpoint commit before minimal corrections and full
verification, without publishing a release. Checkpoint: `bc03b47`.

## Changes

- Shared native CPU/GPU overlap checks compare edge separation rather than
  adding clearance to absolute coordinates. The 0.001 mm physical tolerance
  is unchanged. One relative F32 machine epsilon of the clearance accounts for
  rounding its subtraction; at 0.35 mm this is 4.17e-8 mm. Severity outside that
  boundary is not discounted. Placement-report overlap uses the same comparison.
- GPU block frame translation uses the first component's resident placement
  origin, as native solution serialization already does. Rounded bbox centers
  drift by 0.001 mm for half-grid edges at both zero and nonzero rotation.
  Moving candidates use the corresponding rotated placement origin. Full GPU
  scoring, shortlist, complete search stages and CPU replay remain in place.
- RF's manually supplied U1 footprint excluded protruding pads. Its helper now
  imports the same 4 x 3 mm body and original pads through the real EasyEDA
  importer. RF success and physical-clearance assertions remain intact. Saved
  USB/Telemetry fixtures and authored DSL are unchanged.
- Score contract v13 prevents loading pre-fix native binaries. No numerical
  weights, clearance policy values or runtime dependencies were changed.

## Baseline and verification

Before binary SHA-256:
`6e0be4128d1356f7eaf1d2ff49f9bd4b32e4d64496291cd56451b6370cfae8d1`.
The binary and existing seven-variant CPU/GPU results are retained under
`debugging/release-0.4.0/minimal-fix/before/`. Original input:
`tests/fixtures/block-placement/Telemetry/block-23.json`, upgraded only to the
current transport contract in memory. Real GPU: RTX 3060 Laptop GPU.

Focused Rust checks: GPU feature 99 passed, four hardware probes ignored; CPU
only 78 passed. Focused CPU USB/RF/Telemetry/geometry: 40 passed, zero failed,
one actual-GPU test skipped. The new boundary regression also verifies a real
violation beyond the floating roundoff allowance.

The first implementation using rotated bbox centers was rejected by strict
GPU verification: R36 at rotation zero retained a 0.001 mm translation error.
The placement-origin correction supersedes it. Rebuilds/replays after that
source change are required; failed diagnostic passes are not performance data.

Full-suite, actual-GPU, quality and target-platform validation are pending.
Generated commands, inputs and output remain in ignored
`debugging/release-0.4.0/minimal-fix/`. This intermediate record does not declare
release readiness.

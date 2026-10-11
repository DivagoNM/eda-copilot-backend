# Block preview and fixed families — verification, 2026-10-11

Baseline backend commit: `6c84c96`. TypeScript orchestration changes only; no score, search-budget or native contract changes. Existing Windows x64 addon SHA256: `95C34921795AAEC41C5A66D9E591A9657B456A4778C5F5CFC6E66963A88A81E3`. GPU: NVIDIA GeForce RTX 3060 Laptop, CubeCL/CUDA, F32.

## Commands and results

From the backend root (PowerShell), select CPU using `PCB_BLOCK_BACKEND=cpu`, `PCB_BOARD_BACKEND=cpu`, `PCB_POST_PLACE_BACKEND=cpu` environment variables, then:

```text
node --import tsx --test tests/pcb-block-preview-fixed.test.ts tests/pcb-local-layout.test.ts tests/pcb-fixed-placement.test.ts tests/pcb-existing-placement.test.ts tests/pcb-placement-validation.test.ts
```

48 tests passed in 2.14 s total test-runner wall time. Tests use explicit offline two-pad footprints, three members in a main/satellite family, and one unrelated block. Coverage includes complete staged local search, skipped footprint resolution for unrelated parts, no native board pack call in preview, exact fractional reference position and 90-degree orientation, identical frozen poses before/after full board stages, explicit refineGroup exclusion, out-of-board placement, two conflicting fixed blocks, disallowed orientation, unaccepted recovery, satellite preview and invalid input. Both features are exercised with and without localLayout. Original component fixedPlacement fields remain unchanged.

With all three backend environment variables set to `cubecl`:

```text
node --import tsx --test tests/pcb-block-preview-fixed.test.ts
```

All 12 tests passed in 15.44 s including cold CUDA compilation (~10.14 s native compilation). Real CUDA execution was reported. CPU/GPU timings are not a comparative performance benchmark; cold preparation and test scope differ. No speed multiplier is claimed. Subsequent changes to return-type inference and SVG zoom do not alter solver behavior.

```text
node --import tsx --test tests/pcb-intent-validation.test.ts tests/pcb-intent-cli.test.ts
npm run typecheck
npm run build
```

35 intent/CLI tests passed; backend typecheck and package/worker/declaration build passed.

Final review added actual preserved-member validation: `preserve({components:"all"})` may coexist with a new fixed family, but an already preserved family member fails before search. The focused file then passed all 13 CPU tests (1.90 s). This is input validation, with no numerical/search change. SVG QA found tiny previews and a clipped title at the ordinary board scale; block-only rendering now uses 32 px/mm and 4 mm padding. The final backend build and MCP protocol test were repeated after these changes and passed; PNG output was visually inspected. No extra GPU numerical pass was needed for these validation/presentation changes.

## Integration

EasyEDA Copilot uses the existing local backend dependency. Its MCP build passed. `node mcp/scripts/check-local-backend.mjs` passed through real stdio/WebSocket tools and fixture editor/provider, including block preview PNG/SVG and coordinates, no assembly layoutId, wait-operation recovery and normal fixed-layout preparation, with and without localLayout. `test:pcb-validation` passed 14 backend/stdio/CLI cases; `test:docs` validated 4800 links.

The first integration fixture used a 30x20 mm board with a fixed sparse local layout too close to the edge. The backend correctly returned placementOk=false. Enlarging that test board to 40x30 made the intended valid case pass. Public preview type inference was also corrected after the first integration typecheck.

EasyEDA's complete MCP typecheck has one unrelated existing error at `mcp/src/routing/easyeda-drc-adapter.ts:895` (optional toleranceMm passed as a required number). A compiler-host check substituting the original HEAD PCB integration source reproduced that same single diagnostic. The routing adapter is unchanged.

## Verdict and limits

Feature regression checks pass; selected blocks use unchanged local algorithms, fixed families retain all resolved poses. Preview omits external/board-level intent explicitly and never produces a board assembly. No full-board corpus/performance acceptance is claimed. edgePlace still requires board packing and is marked unresolved. Fixed roots inside modules and competing absolute placements are intentionally rejected. Existing EasyEDA routing typecheck debt remains outside this change.

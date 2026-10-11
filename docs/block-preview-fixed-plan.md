# Block preview and fixed placement implementation

User request, 2026-10-11: implement and test independent block preview and fixed-block placement in EDA Copilot Backend, then integrate into EasyEDA Copilot and update DSL documentation. Both features must work without localLayout. Use Conventional Commits.

## Contract

- `solver({ previewBlock: "name" })` solves only the named block and its satellite descendants using the complete existing block algorithms. Skip other footprints, board packing and global refinement. Return a preview, never a board assembly to apply. External constraints are explicitly unassessed.
- `block(..., { fixed: { reference: "U1", x, y, rotate } })` solves normally, transforms the solved family so the reference component has that exact board pose, then freezes every family component through all later stages. Independent of localLayout. No native score/search changes.
- First version: fixed root blocks only, no containing module or parent attachment, no independently fixed/edge-mounted descendants, no layer flip. Quarter-turn reference orientation; validate resulting allowed orientations and geometry. Satellites move with the fixed root.

## Work checklist

- [x] Inspect backend and integration contracts, repository instructions and existing tests.
- [x] Add typed DSL/schema/model options and validation.
- [x] Add complete selected-subtree preview path, scoped metadata/constraints, result/rendering and API handling.
- [x] Add post-solve block transform, immutable descendants, downstream refinement protection and final verification.
- [x] Focused regression tests: both features with/without localLayout, satellites, filtering, conflicts and full-pipeline preservation.
- [x] Typecheck, build, relevant backend tests; document verification and limitations.
- [x] Update EasyEDA backend dependency/integration, preview-only handling, DSL and usage guidance; run relevant checks.
- [x] Review diffs and update changelogs. Commit each repository with Conventional Commits as the final delivery step.

## Implementation notes

- Existing subtree entry: `solvePlacementSubtreeSync` in `tree-solver.ts`; share `solveNode` and complete block stages.
- Existing native board primitives support `locked`; board application preserves locked poses.
- `rememberPrimitive` sets `anchored` and portfolio alternatives; a fixed family must not retain mutable alternatives anywhere below it.
- Final refiner currently looks at component fixedPlacement and allows explicit refineGroup overrides. Derived fixed block poses must also be excluded from explicit groups.
- Existing preview filter does not scope extracted localLayouts; scope those with selected rules.
- Keep fixes minimal, preserve authored inputs, use existing F32/coordinate helpers, reuse worker pool, no new scorers.

## Progress / verification

Plan recorded before edits. Both repository working trees were clean at start.

Backend typecheck/build passed; 48 focused CPU tests passed; all 12 new tests passed on CubeCL/CUDA (RTX 3060 Laptop). No native contract/search changes. EasyEDA already uses `file:../../eda-copilot-backend`; rebuilt that dependency and synchronized mcp/docs/pcb-layout/dsl.ts. Added block-preview response and no-layoutId guard, documentation and protocol regression cases.

Integration complete: the MCP protocol test correctly rejected a seeded fixed family too close to the initial 30x20 test board edge; enlarged the TEST board to 40x30 and it passed. Fixed public blockPreview type inference by retaining typed previewResult separately. Build and repeated protocol checks passed. MCP typecheck has one unrelated pre-existing number|undefined error at mcp/src/routing/easyeda-drc-adapter.ts:895; the baseline HEAD PCB integration reproduces the same diagnostic. Routing source was left unchanged.

Final review: added a 13th CPU regression for preserve-all with a new fixed family versus an actually preserved member. It passes, along with final backend typecheck/build. Improved block-only SVG zoom after visual QA; final MCP protocol test and PNG inspection passed. Another 35 backend intent/CLI tests passed; MCP validation passed 14 cases and documentation passed 4800 links. Detailed evidence and limits: [verification](experimental/pcb/block-preview-fixed/README.md). Ready for the final Conventional Commits in both repositories; no publishing or remote pushes requested.

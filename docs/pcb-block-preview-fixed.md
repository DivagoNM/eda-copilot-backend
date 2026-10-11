# Block previews and fixed blocks

Both features work independently, with or without `localLayout`.

## Preview a block

```ts
board.rect(60, 40);
block("power", ["U1", "L1", "C1"], "power");
// Other block definitions can remain in the same DSL.
solver({ previewBlock: "power" });
```

The backend resolves only this block's components and satellite descendants, then runs the complete production subtree solver: islands, local-layout legalization when present, block hypotheses, search stages and local refinement. It returns immediately after local validation and rendering; other blocks, board packing and global refinement are skipped. Search budgets and native scoring are unchanged.

Use this when uncertain about block quality. Inspect footprints, internal pad connections, clearances and diagnostics, revise the block, and preview again. Remove `previewBlock` for full placement. An isolated preview cannot assess its external connections, parent/module positioning or whole-board fit. Board-level hints are excluded with a warning; internal signal-path segments are retained. Selecting a satellite previews it without solving its parent. Do not combine `previewBlock` with `placeOnlyComponents` or `ignoreComponents`.

`makePcbLayout` returns `blockPreview` (name, included blocks, coordinateFrame, placements, bbox, placementOk and solveMs), `toolReport` and `preview_image_url`. It returns no `pcb` assembly. Free electrical blocks use the solver's local frame; fixed/mechanical blocks retain the board frame. `edgePlace` needs board packing and is reported as unresolved in this mode. A recovery layout with no admissible block candidate is shown with `placementOk: false`, never accepted as success.

## Fix a whole block on the board

```ts
block("power", ["U1", "L1", "C1"], "power", {
  fixed: { reference: "U1", x: 20, y: -10, rotate: 90 },
  // localLayout is optional and retains its usual approximate seed semantics.
});
```

The solver first finishes the ordinary local block and satellite search. It then transforms the entire family so the reference component's center is exactly at the authored board coordinates (mm), with the requested final reference angle. All family components are frozen for board packing, layout alternative selection, final refinement and board alignment. Explicit `refineGroup` rules cannot override a fixed block. Authored DSL/component poses are not rewritten.

The reference must be a direct member. The first version supports root blocks outside modules, quarter-turn reference angles (0/90/180/270), and no layer flip. Independent component `fixed`, `edgeMount`, `edgePlace`, fixed board pads and preserved members conflict with block fixation. Invalid resulting orientations are errors. Collisions, board bounds, holes and region conflicts are reported instead of moving the block.

Keep blocks free unless their position is intentional. `fixed` constrains full-board optimization; it does not make an invalid local block valid or cache a previous preview.

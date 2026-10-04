# Board Package geometric routing experiment

Base: c1dd3f0, branch feat/experimental-unified-relations. User requested committing the experiment after inspecting the latest STM run.

## Scope

Board Package route correction changes. Beam shortlist refinement, joint pairs and local improvement call the same `board_geometric_route_penalty`. A* and its board grid cache are removed from this solver. GPU still scores/shortlists candidates; the geometric correction runs on CPU for both backends, as the former A* correction did.

User expanded the scope to final PostPlace: its encoder now selects the existing geometric mode, also used by block postrefinement. Native PostPlace already scores net length, ratline crossings, pad hits, relations and passive-to-IC stretch; no second geometric correction is added. Micro-A* comparisons are skipped in this mode. The user reduced the final PostPlace improvement threshold from 100 to 10 after testing D4. This applies globally to final PostPlace. Mechanical checks are retained. Block routing policy is unchanged. Search widths, candidate counts/budgets, relation curves, compactness and mechanical legality are not retuned.

## Shared implementation

Reuse `fast_route` path_cost: direct path, two L paths and four doglegs. Existing prices: foreign pad 20, clearance band 2, foreign ratline crossing 3, plus excess path length. This is a bounded proxy, not a detailed router or a connectivity proof.

Board input now carries pad rectangles, owners, references, nets and layers. Each rectangle follows its source primitive rotation/translation. Through-hole obstacles apply to both sides. Same-net pads are not foreign obstacles. Ground is excluded from the connection skeleton (same block policy), but ground pads remain obstacles for other nets. Board skeleton does not use the block's 32-point net cutoff. Known opposite-layer skeleton links do not count as crossings; mixed/unknown layers use conservative projection.

Reusing only candidate outgoing links would miss a disconnected block obstructing existing links. `added_obstacle_penalty` uses the same path_cost before/after adding its pads. Only positive added obstruction is charged, preserving the non-negative correction required by existing lazy shortlist bounds.

Limits: keeps the existing nearest-four endpoint alternatives and minimum geometric path cost; it does not score every all-pairs ratline. Scores are incremental and depend on placement order, as the previous route correction did. Existing links are a deterministic spanning-tree skeleton, not SVG's X-sorted chain. No numeric score or via count is interpreted as proof of final traceability.

## Validation

Results to be recorded after rebuilding. Final board quality requires STM32/ESPower inspection; no improvement or speedup is presumed.

### Completed checks

- Native build and TypeScript typecheck passed; Rust: 105 passed, 5 ignored.
- Board/native/F32/unified relations: 21 passed.
- PostPlace: 19 passed, 6 optional tests skipped; one explicit GPU parity test passed separately.
- Default final PostPlace test confirms zero micro-router evaluations; explicit micro mode remains tested.
- Saved two-primitive replay including owned pads: CPU/GPU states and ranks identical, no fallback. Both CPU and GPU use the same CPU geometric correction after their shortlist.
- CPU board sample: previous A* 10.19 ms, geometry 1.84 ms. These tiny single samples include warmup/noise and do not establish a full-board speedup. GPU samples include kernel startup, also unsuitable as an acceleration claim.
- Outputs and addon hash: [replay.json](replay.json). Full STM32/ESPower quality remains for user review. Commit requested by the user.

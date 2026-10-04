# Explicit geometric connections

Base: e0e1de4. User authorized including exact authored signalPath and criticalPair segments in geometric crossing checks, with stronger penalties by importance. No commit until quality review.

## Rules

- Ordinary link = class 0; authored pad-to-pad criticalPair = class 1; signalPath = class 2. Priority applies to the explicit segment, not the entire net or every critical near relation.
- Shared Rust/CubeCL `relation_score::crossing_factor`: ordinary/ordinary 1, critical/ordinary 2, critical/critical 3, path/ordinary 3, path/critical 4, path/path 5. Pad factors: 1/2/3.
- Coincident endpoint pairs on the same net are merged (including reversed pairs); strongest class wins. Explicit segments are present even if absent from the ordinary MST. No additional wire-length penalty is added in PostPlace.
- Same net, common endpoints and known opposite layers do not count as foreign crossings. Through-hole/mixed-side connections use conservative layer projection. Explicit zero-length waypoints are skipped.
- Explicit critical/path crossings use unit crossing weight, independent of the net's reduced power-length weight. Ordinary net weights remain unchanged.

## Integration and limits

Block/Board geometric route proxy passes original relations and current pad geometry to fast_route. Explicit segments are checked individually, not chosen by the ordinary nearest-four minimum. Existing skeleton segments are reused without exact duplicates. Board incoming-pad obstruction includes explicit links too.

PostPlace unions its ordinary MST segments with explicit segments for crossing/pad evaluation only; original length, localStretch and relation formulas remain. GPU compiles the same authored pad pairs and evaluates the union on-device; no CPU-only fallback for this feature. Score contract v4 prevents a stale addon silently ignoring the new data.

The stages still have different pre-existing base prices and geometry models: the bounded path proxy may choose a short dogleg, while PostPlace scores straight connection segments. This change unifies explicit coverage, importance and duplicate rules; it does not claim all stage objectives identical. Block's separate ordinary direct-pad score remains unchanged. Existing search budgets, rotations and final threshold 10 remain unchanged.

Scope: explicit pin-to-pin relations on a shared nonempty net. Component/group proximity is not treated as an electrical wire. Partial assembly checks a relation when both endpoints are available. Ignored ordinary nets do not suppress an explicit relation if its endpoints are present in the input geometry.

## Validation

Pending final build, CPU/GPU replay and saved STM D4/D5 comparison. No full-board quality claim.

### Completed verification

- Native score-contract v4 rebuilt; TypeScript typecheck passed.
- Rust: 108 passed, 5 ignored. CPU integration: 40 passed, 6 optional GPU tests skipped; all 25 PostPlace tests then passed with GPU tests enabled.
- Block/Board CPU/CubeCL replay: identical states/ranks. Final STM PostPlace replay: identical CPU/GPU states/scores, no fallback, full per-candidate CPU score verification enabled.
- Replay scope: saved STM 2026-10-04T11-08-21-431Z; one refinement iteration restricted to D4/D5 standalone rotations, no swaps, threshold 10. D4 +180 was accepted on both backends: improvement 1690.094 (old score improvement 70.094).
- D5 +90 counterfactual score improvement changed from -257.813 to +192.188. This angle is not a standalone PostPlace candidate; search was intentionally not expanded. Its mechanical legality was not established by the score-only comparison.
- [evidence.json](evidence.json) records addon hash, comparisons and test totals. No full-board solve or speed/quality acceptance claimed. No commit.

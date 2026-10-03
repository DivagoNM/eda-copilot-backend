# Pair seed admission — 2026-10-03

Status: implemented, validated locally, and approved for commit on 2026-10-03.
User reports remaining C2/C3 placement issues; those require a separate investigation.
Follow-up scope and stage evidence: [placement quality audit](../placement-quality-audit/README.md).

Remove the intermediate `comparableBlockQuality` admission gate from
`selectPairSeeds`. Rank hypotheses by their best saved native score and keep at
most two distinct eligible seeds. Retain near-duplicate suppression, the existing
12-primitive limit and requirement for two movable primitives. No score weights,
beam width, native move generators, GPU code or final post-place threshold changed.
The native comparator remains available to other consumers; this is an orchestration
change, not a new TypeScript scoring formula.

The old gate required electrical <= best * 1.12 + 20, as well as wire and link
comparability. Its thresholds survived the migration from TypeScript to Rust
scoring, although the electrical measurement changed meaning. A poor intermediate
released hypothesis could therefore be stopped before the pair moves that fix it.

## Validation

- `npm run typecheck`: pass.
- `node --import tsx --test tests/pcb-block-search-stages.test.ts`: 4 passed,
  including admission of a released seed with worse intermediate measurements
  and preservation of the seed limit.
- `npm run debug:pcb-layout -- capture STM32G0_CAN_RS485`: completed; all fixture
  assertions passed, placementOk=true, 68 components, zero overlaps, outside-board
  components or hard hint violations. No actual PCB routing run was performed.

Baseline: `debugging/pcb-layout/runs/STM32G0_CAN_RS485/2026-10-03T18-29-54-024Z`.
After: `debugging/pcb-layout/runs/STM32G0_CAN_RS485/2026-10-03T18-54-38-877Z`.
Both use native SHA256
`0a09161dffb175e5da17552ddc646793748bf87fe880a57ccebd7926afe8f345`,
auto backends and default worker settings, on the same machine. No native rebuild.

| Buck family / final measurements | Before | After |
| --- | ---: | ---: |
| Hypotheses admitted to pairs | 1 | 2 |
| Selected local candidate | grouped/singles | released/pairs |
| Native candidate score | 275109.34 | 43960.84 |
| Candidate area, mm² | 362.51 | 296.17 |
| Final U1.6–L1.1, mm | 2.410 | 2.410 |
| Final U1.6–D3.1, mm | 4.091 | 4.181 |
| Final U1.5–C3.1, mm | 5.186 | 2.658 |
| Full capture wall time, seconds | 69.54 | 101.1 |
| Native block capture calls | 45 | 47 |

The previously skipped candidate wins in the integrated pipeline, matching the
isolated diagnostic continuation. L1 remains rigid relative to U1; D3's SW link
is slightly longer, while the family is smaller and C3 is closer to VIN.
The timing is one full pipeline observation per version, including GPU startup
and changed board packing work, not an isolated cost of the extra pair seed.
Removal applies to all block families, so review the full placement before
approving. Beam-search quality and other pruning stages are outside this change.

# PCB intent validation

`validatePcbLayoutIntent` is a synchronous, offline API exported from the package root and `eda-copilot-backend/pcb`. It executes the existing JavaScript placement DSL with its normal one-second timeout, validates the resulting rules against the attached schematic, and checks recognized electrical motifs. It does not run placement, resolve/download footprints, call an LLM or evaluate native scores.

```ts
import { validatePcbLayoutIntent, detectCircuitPatterns } from 'eda-copilot-backend/pcb';

const diagnostics = validatePcbLayoutIntent({
  code: placementDsl,
  circuit,
  footprints,        // optional map keyed by designator
  existingPlacement,// optional; required by preserve(...)
  knowledge: {      // optional verified device/application facts
    components: {
      U1: { supplyGroups: [['2'], ['40']] },
      U2: { functions: ['adc'], pinFunctions: { '3': 'REF' } },
    },
  },
});
```

The result is a JSON array of `{ code, severity, message, context? }`. All generated messages are English. Severity is `error`, `warning`, or `info`; context contains component designators and/or one-based DSL `locations: [{ line, column? }]`. Raw JavaScript stacks are excluded. Source locations compensate for the existing strict-mode and localLayout preambles, including authored calls in loops/functions.

Errors report invalid input, duplicate component/pin identities, profile references, malformed/executing DSL, unknown targets, ownership, paths, preview filters, preserve context and localLayout. Structural validation reuses the production collectors, including the production allowance for arbitrary-role fixed components. Invalid structure stops motif checks to avoid misleading cascades.

Warnings report missing explicit placement intent for recognized motifs. High/critical pad pairs, signalPath/core pairs, pin-specific attraction, electrically corresponding bypass/capCluster anchors and authored rigid localLayout can express the same intent. Low-priority/component-center relations or mere block ownership do not establish pad locality. This verifies the *presence and target* of intent, not whether a distance/priority is optimal for a particular IC. Authored localLayout grouping is accepted and its unverified physical distances are reported in coverage info.

An info diagnostic describes missing knowledge, unavailable supply geometry, unidentified functional pins, preview scope, or localLayout limits. Empty output only means there were no findings in the evaluated scope. It does not certify electrical completeness, routed loop area, return-current continuity, EMI, fabrication compliance, actual geometric separation or routing quality. `hard` remains the solver's existing amplified preference.

## Recognition and confirmed knowledge

`detectCircuitPatterns({ circuit, knowledge?, footprints? })` exposes the same reusable recognizers independently of DSL validation. Matches contain `patternId`, sorted `components`, component `roles`, named `pins`, exact electrical `nets`, explicit `requirements`, and an evidence kind. Patterns may overlap and span multiple DSL blocks. Detection never consumes components or mutates input.

Standard unambiguous pin names can recognize bootstrap/flying capacitors, feedback, switch motifs and crystals. Component prefixes identify simple two-pin R/C/L/D parts, crystals and connectors; a MOSFET also requires gate/source/drain functions. Device identity is never guessed from an MPN substring. Ambiguous multi-channel pin names are skipped; a verified pinFunctions mapping can identify one channel using the documented aliases. Ground roles help identify a branch but never merge AGND, PGND or any other net.

`knowledge.components[designator]` accepts:
- `kind`: confirmed component kind. Specialized kinds used by the catalog are `transformer`, `inductive-load`, `flyback-diode`, `photodiode`, `shunt`, `esd`, `common-mode-choke`, `ethernet-magnetics`, `balun`, and `optocoupler`. Basic kinds are `resistor`, `capacitor`, `inductor`, `diode`, `mosfet`, `crystal`, `connector`, and `ic`.
- `functions`: confirmed application tags. The catalog uses `supply-filter`, `bulk-capacitor`, `local-capacitor`, `ldo`, `boost`, `buck-boost`, `sepic`, `gate-driver`, `active-filter`, `adc`, `reference-buffer`, `high-impedance-input`, `current-sense`, `oscillator`, `source-termination`, `receiver-termination`, `pll`, `qspi-host`, `qspi-flash`, `ac-coupling-source`, `ethernet-phy`, `can-endpoint`, `rs485-endpoint`, `usb-series-required`, `rf-matching`, `rf-series`, `rf-shunt`, and `rf`. Supply-filter, RF series and RF shunt tags must only be applied to confirmed two-terminal passives.
- `pinFunctions`: map of pin number to verified canonical function. It overrides the schematic name; pin identity remains unchanged. Accepted aliases are explicit in each catalog file. To identify one channel of a multi-channel device, give that channel OUT/IN-/IN+ aliases and assign other channels distinct functions.
- `supplyGroups`: arrays of physically local supply pin numbers. Different groups must not repeat a pin. Without them, supplied footprint geometry can identify unambiguous different perimeter sides; this coarse heuristic does not divide far-apart pins on the same side or establish a datasheet distance. No groups are inferred from pin numbering.
- `placement`: confirmed mechanical/application purpose `antenna`, `cold-junction`, `ambient-temperature`, `monitored-temperature`, or `magnetic-sensor`, plus `target?`, `avoid?`, `edge?`, and `minDistance?`. Targets and interference/heat sources must be explicit component identities. A thermal sensor's ambient and monitored-object purposes have opposite placement requirements.

`knowledge.isolation` accepts `{ domains: { [designator]: domainName }, minClearance }`. The check requires authored clearance between distinct declared domains; an ordinary away hint cannot prove the stated clearance. No safety standard or insulation limit is inferred. Like every intent warning, satisfying the declaration is not a physical clearance measurement.

ESD entry checks apply only to parts explicitly identified as ordinary connector ESD protection. Ethernet protection positioning, integrated MagJacks, internal regulator quirks, physical antenna keepout/orientation dimensions and topology-specific termination choices require their verified profile; absence is not diagnosed from a guessed device identity.

## Extending the catalog

The [implementation plan](pcb-intent-validation-plan.md) preserves all 60 agreed patterns, prerequisites and implementation rules.

1. Add `src/pcb-layout/intent-validation/recognition/catalog/<id>.ts`: a CircuitPatternDefinition with typed component nodes, unambiguous pin aliases, same-net graph links, optional support nodes and selected local obligations. Add a specialized recognizer only when the shared graph matcher cannot express the circuit.
2. Register it explicitly in `src/pcb-layout/intent-validation/recognition/registry.ts`.
3. Add `src/pcb-layout/intent-validation/patterns/<id>.ts` and register its checker in `registry.ts`. Shared family semantics use `createPatternChecker`; custom requirements/checkers can be introduced without coupling detection to DSL or mutation.
4. Add an independently authored electrical example, a disconnected/lookalike negative example and intent-equivalence/exception tests. Keep all messages English and codes stable.
5. Update prerequisites/coverage docs and the changelog.

The initial 60 entries implement conservative **core motif and declared intent checks**, not every datasheet variant of each family. For example, active-filter matching currently covers a declared Sallen-Key motif, USB matching covers declared series-resistor requirements, QSPI matching checks its declared clock relation, and antenna checking verifies declared target/avoid/edge intent. Richer MFB circuits, integrated protection/magnetics, pair symmetry/skew, actual pad-side geometry, copper keepouts and datasheet limits can extend these files without changing the API. Draft DSL generation and automatic application are future consumers of the exported match requirements.

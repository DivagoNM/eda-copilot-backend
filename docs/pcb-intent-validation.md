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

Warnings report missing or conflicting explicit placement intent for recognized motifs. High/critical pad pairs, signalPath/core pairs, pin-specific attraction, electrically corresponding bypass/capCluster anchors and authored rigid localLayout can express locality. A declared interface `minimumPriority: 'critical'` requires that priority; a high-priority hard pair or a rigid group does not substitute for it. Low-priority/component-center relations or mere block ownership do not establish pad locality. This verifies the *presence and target* of intent, not an optimal distance for a particular IC. Mixed bulk/local capacitor groups and cross-domain rigid groups have separate advisory checks. Authored localLayout grouping is accepted for ordinary locality and its final physical distances remain unverified.

An info diagnostic describes missing knowledge, unavailable supply geometry, unidentified functional pins, preview scope, or localLayout limits. Empty output only means there were no findings in the evaluated scope. It does not certify electrical completeness, routed loop area, return-current continuity, EMI, fabrication compliance, actual geometric separation or routing quality. `hard` remains the solver's existing amplified preference.

## Connector mechanical placement

`connector-placement` adds the warning-only code `PCB_INTENT_CONNECTOR_PLACEMENT`. It recognizes J/P/CN designators, confirmed `kind: 'connector'` profiles and explicit DSL `component(...).role('connector')` declarations, without requiring named/connected pins. A verified different kind overrides a prefix/role guess. Each connector is checked independently, including across blocks; placement preview limits its scope. Standalone `detectCircuitPatterns` callers can pass `componentRoles: { USB1: 'connector' }` for explicit mechanical roles; these roles are considered only by catalog nodes that opt into them, without changing electrical component kinds.

The warning reports either missing mechanical binding or a fixed position farther than a **5 mm** edge-proximity guideline. `fixed()` and selected `preserve()` positions are measured against the authored board perimeter; fixed anchors, explicit coordinate overrides and offsets use the shared placement resolver. Supplied footprints use their rotated axis-aligned bounding box; without a footprint, distance uses the component center and the message says so. Preserved footprint source origins are normalized with the existing offset transform. Polygon cutout edges count as perimeter; outline construction, segment tests and distances reuse the PCB geometry helpers with F32 and the 0.001 mm tolerance.

`edgeMount()` (including sliding mounts) and `edgePlace()` express mechanical edge binding. An `edgePlace()` inset greater than 5 mm warns as well. A soft `edge()` hint, a block or a localLayout does not fix a connector, and a hint does not hide a fixed position far from the perimeter. If a fixed connector has an auto-sized board, the warning explicitly says edge proximity cannot be checked. Supplying existing placement without selecting the connector with `preserve()` does not bind it.

This is an access/mechanics heuristic, so an intentional internal header can produce an advisory warning. It does not verify mating direction, casing access, the actual housing shape, final solver placement or routed geometry. The reusable match exposes a `connector-placement` requirement with `source` and `maxEdgeDistance`; the recognition and checker files are registered under `pcb-layout/intent-validation` like the other patterns.

## Debug command

Run from the backend directory, using the same fixture directory names as `test:pcb-layout`:

```sh
npm run debug:pcb-validation -- --list
npm run debug:pcb-validation -- esp32c3
npm run debug:pcb-validation -- rp2040_base ThunderF722
npm run debug:pcb-validation -- --all
npm run debug:pcb-validation -- esp32c3 --strict
npm run debug:pcb-validation -- --code placement.js --circuit circuit.json --knowledge knowledge.json
```

Each run saves `diagnostics.json` (the API's diagnostic array), `summary.json`, `summary.md`, and exact input snapshots in `debugging/pcb-validation/runs/<fixture>/<timestamp>-<unique suffix>/`. The console prints counts, the first 24 findings and the report path. The script calls only the offline validator; it does not execute the fixture's placement runner or download footprints. A JSON-only fixture without DSL is excluded from the list. Alternate DSL files can be selected with `--code` on one fixture.

Optional `knowledge.json`, `footprints.json` and `existing-placement.json` in a fixture directory are loaded automatically. `--knowledge`, `--footprints` and `--existing-placement` accept explicit JSON paths; together with `--code` and `--circuit`, they can override one fixture or validate standalone files. Footprints must be the API's map keyed by designator. Relative file paths resolve from the current working directory. `--output-dir` selects a different report root. Batch validation continues after a failed fixture.

Exit status is `0` for no errors, `1` for validation errors (or warnings with `--strict`), and `2` for command/input-file failures. Info diagnostics never fail a run. A passing status retains the API's coverage limits and does not certify final placement or routing.

## Recognition and confirmed knowledge

`detectCircuitPatterns({ circuit, knowledge?, footprints? })` exposes the same reusable recognizers independently of DSL validation. Matches contain `patternId`, sorted `components`, component `roles`, named `pins`, exact electrical `nets`, explicit `requirements`, and an evidence kind. Patterns may overlap and span multiple DSL blocks. Detection never consumes components or mutates input.

Standard unambiguous pin names can recognize bootstrap/flying capacitors, feedback, switch motifs and crystals. Component prefixes identify simple two-pin R/C/L/D parts, crystals and connectors; a MOSFET also requires gate/source/drain functions. Device identity is never guessed from an MPN substring. Ambiguous multi-channel pin names are skipped unless a verified `channels` map or a `pinFunctions` mapping identifies the relevant channel. A channel is selected as one coherent pin set: OUT from channel A cannot be combined with IN- from channel B. Ground roles help identify a branch but never merge AGND, PGND or any other net.

`knowledge.components[designator]` accepts:
- `kind`: confirmed component kind. Specialized kinds used by the catalog include `transformer`, `coupled-inductor`, `inductive-load`, `flyback-diode`, `tvs`, `photodiode`, `current-source`, `shunt`, `esd`, `common-mode-choke`, `ethernet-magnetics`, `magjack`, `balun`, `optocoupler` and `igbt`. Basic kinds are `resistor`, `capacitor`, `inductor`, `diode`, `mosfet`, `crystal`, `connector`, and `ic`.
- `functions`: confirmed application tags. The catalog uses `supply-filter`, `bulk-capacitor`, `local-capacitor`, `ldo`, `buck`, `boost`, `buck-boost`, `sepic`, `flyback-controller`, `flyback-secondary-switch`, `gate-driver`, `active-filter`, `adc`, `reference-buffer`, `high-impedance-input`, `current-sense`, `oscillator`, `source-termination`, `receiver-termination`, `pll`, `vco`, `qspi-host`, `qspi-flash`, `ospi-host`, `ospi-flash`, `ac-coupling-source`, `ac-coupling-receiver`, `common-mode-receiver`, `ethernet-phy`, `ethernet-center-tap-cap`, `ethernet-line-termination`, `ethernet-chassis-cap`, `ethernet-protection`, `connector-filter`, `differential-input`, `differential-return`, `can-endpoint`, `rs485-endpoint`, `usb-series-required`, `rf-matching`, `rf-series`, `rf-shunt`, `rf-endpoint`, and `rf`. Supply-filter, RF series/shunt and connector-filter tags must only be applied to confirmed two-terminal passives. Ethernet center-tap/support tags must identify the actual winding side.
- `pinFunctions`: map of pin number to verified canonical function. It overrides the schematic name; pin identity remains unchanged. Accepted aliases are explicit in each catalog file. To identify one channel of a multi-channel device, give that channel OUT/IN-/IN+ aliases and assign other channels distinct functions.
- `channels`: `{ [channelName]: { [canonicalFunction]: pinNumber } }`, for example `{ A: { OUT: 1, 'IN-': 2, 'IN+': 3 }, B: { OUT: 4, 'IN-': 5, 'IN+': 6 } }`. Functions and physical terminals must be distinct within each channel; shared return pins may be repeated across channels. The same mechanism serves amplifier, charge-pump and protection-array channels.
- `supplyGroups`: arrays of physically local supply pin numbers. Different groups must not repeat a pin. Without them, a supplied footprint conservatively creates a separate target for each represented logical supply pin. Package sides or adjacent pin numbers are not proof that one anchor serves every pin. Adjacent pins can share an explicitly verified group. Repeated physical pads remain logical-pin targets and produce a coverage limitation.
- `interfaces`: confirmed QSPI/OSPI endpoint maps, `{ function: 'qspi' | 'ospi', peer, signals: [{ source, target }], minimumPriority?: 'high' | 'critical' }`. Endpoints must be unique and connected directly or through one unambiguous two-terminal resistor. Tagged host/flash devices can also recognize unambiguous named clock/data/select functions. The declared priority describes this application's needs; speed, clock frequency and timing are not guessed. Level shifters or longer/ambiguous series chains need another variant.
- `entryChain`: `{ connector, receiver, protection?: { component, side: 'connector' | 'receiver' } }` on a confirmed common-mode choke. Its named IN+/IN-/OUT+/OUT- pins and receiver input functions must agree with the schematic. Protection then targets the declared side of the choke. The validator does not invent one placement order for all protocols.
- `preferredGateResistorSide`: `'driver' | 'device'` on a confirmed gate driver. Selects the corresponding actual pad anchor for each recognized resistor branch.
- `branchLengthTolerance`: a verified nonnegative tolerance in millimetres for parallel gate, differential-amplifier or AC-coupling branches. It compares authored pad spans, not routed lengths. Differential-amplifier span checks additionally need `differential-input` and `differential-return` tags to distinguish its two noninverting-side resistors.
- `placement`: confirmed purpose `antenna`, `cold-junction`, `ambient-temperature`, `monitored-temperature`, `magnetic-sensor`, `quiet-controller`, or `external-load`, plus `target?`, `avoid?`, `edge?`, `minDistance?`, `rotations?`, `alignment?`, and `keepout?`. Targets and interference/heat sources are explicit component identities. Ambient and monitored-object purposes have opposite requirements. Quiet-controller checks additionally require the confirmed `flyback-controller` function.

`placement.alignment` is `{ axis: 'x' | 'y' | 'both', tolerance, offset?: { x, y } }` and requires `target`. It checks authored component centers against the declared target plus offset. `placement.keepout` is `{ region, minimumWidth?, minimumHeight?, layers?, allowBlocks? }`: the named constraintRegion must meet the declared dimensions/layers and may permit only the declared exception blocks. With no allowBlocks, it must have no exceptions. The check does not certify the region's final overlap with a module's radiating geometry or copper.

Authored geometry requires all relevant positions in the same localLayout, or explicit absolute fixed positions in one board frame. Pad-span checks additionally need explicit component layers and exactly one supplied physical pad for each endpoint. Existing shared rotation/mirroring and coordinate-transport helpers are reused; differences and distances use F32 with the repository's 0.001 mm physical tolerance. Missing/ambiguous geometry produces a pattern-specific `_COVERAGE` info diagnostic; it is never treated as a successful measurement. Solver legalization, final placement and routed skew remain unverified.

`knowledge.isolation` accepts `{ domains: { [designator]: domainName }, minClearance, pinDomains?: { [designator]: { [pinNumber]: domainName } } }`. An optocoupler or other bridging device can declare the domain separately on each side instead of belonging to one component-wide domain. Exact nets joining distinct declared domains are errors, including incorrectly assigned support components. The placement check requires authored clearance between different domains and warns about a rigid localLayout spanning them; an ordinary away hint cannot prove a numerical clearance. No insulation limit or safety standard is inferred, and satisfying the declaration is not a physical clearance certification.

ESD entry checks apply to confirmed ordinary connector ESD protection; `ethernet-protection` excludes a part from that ordinary anchor rule. Integrated MagJacks, winding center taps, application-specific antenna requirements and termination choices use verified profiles; absence is not diagnosed from a guessed device identity. Dedicated shunt SENSE+/SENSE- and switch KS/KE functions take precedence over power terminals, even on the same net. A four-terminal shunt with unidentified sense pins produces limited-coverage info rather than falling back to force pins.

## Extending the catalog

The [implementation plan](pcb-intent-validation-plan.md) preserves the original 60 agreed patterns, the additional connector-placement pattern, prerequisites and implementation rules.

1. Add `src/pcb-layout/intent-validation/recognition/catalog/<id>.ts`: a CircuitPatternDefinition with typed component nodes, unambiguous pin aliases, same-net graph links, optional support nodes and selected local obligations. Related circuit variants stay in that file's `variants`. `pinCount`, `kinds`, function exclusions, channel maps and explicitly allowed `sameNets` keep electrical alternatives distinct. Mechanical purposes, preferred gate anchors and balanced branch roles are declared by the catalog entry. Add a specialized recognizer only when the shared graph matcher cannot express the circuit.
2. Register it explicitly in `src/pcb-layout/intent-validation/recognition/registry.ts`.
3. Add `src/pcb-layout/intent-validation/patterns/<id>.ts` and register its checker in `registry.ts`. Shared family semantics use `createPatternChecker`; custom requirements/checkers can be introduced without coupling detection to DSL or mutation.
4. Add an independently authored electrical example, a disconnected/lookalike negative example and intent-equivalence/exception tests. Keep all messages English and codes stable.
5. Update prerequisites/coverage docs and the changelog.

The second pass implements the concrete omissions from the initial 60-pattern audit: low-pass MFB, RCD/TVS support, dedicated/filtered Kelvin and emitter paths, QSPI/OSPI grouping, external power switches, Ethernet center-tap/MagJack support and declared antenna/geometry intentions. The [per-pattern audit](pcb-intent-validation-plan.md#completion-audit-2026-10-08) lists the actual graph variants and remaining boundaries. This is still bounded recognition, not an exhaustive electrical verifier for every circuit in those families. Draft DSL generation and automatic application are future consumers of the exported match requirements.

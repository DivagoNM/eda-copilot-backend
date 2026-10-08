# PCB intent validation

`validatePcbLayoutIntent` is exported from the package root and `eda-copilot-backend/pcb`. It is synchronous and offline. Its input is exactly `MakePcbLayoutInput`: `{ code, circuit, footprints?, existingPlacement? }`. It reuses the existing input schema. No additional metadata is requested from an LLM.

`validatePcbLayoutIntent({ code, circuit })` returns a JSON array of `{ code, severity, message, context? }`. Messages are English; severity is `error`, `warning` or `info`. Optional context contains components and, for execution errors when available, one-based DSL locations. Raw stacks are not returned. Pattern warnings identify components without instrumenting the production DSL runner.

Execution reuses the production runner and its one-second timeout, localLayout helpers, preserve/preview helpers and existing structural validator. Structural failures stop pattern checks and produce one error with the production message, which can contain several findings. Additional checks cover duplicate component/pin identities, schematic pin/block references and electrically unrelated bypass targets. References to DSL-generated terminals use production structural checks; independent terminal coverage is reported as info rather than duplicating their compilation.

Recognition uses the schematic graph, pin names, reference prefixes, explicit descriptive component/footprint labels and authored connector roles. It does not infer device facts from part-number substrings or contact external services. Ambiguous unnamed or multi-channel pins are skipped. Each named supply pin is conservatively checked independently; package geometry alone does not prove that distant pins can share a capacitor. Every target in a supply-domain group must have locality intent.

High/critical or hard pad pairs, paths, pin-specific attraction, matching bypass/capCluster anchors and authored localLayout grouping can satisfy locality. LDO capacitors, VCAP/VREG capacitors, filtered-supply decoupling, oscillator supply capacitors and single-pin shared-rail decoupling also accept a small dedicated functional family. That means a parent block and all recursive attachTo descendants, at most the existing 12-component block limit in total, with one active core. A board-wide family or multiple active cores do not establish ordinary locality. Critical loops keep terminal-level requirements; distributed supply/domain checks require an assignment to every target pin, even with localLayout. The check verifies declared intent, not final routed loop area, trace symmetry, EMI, isolation standards or placement quality.

The shared recognition context resolves rail-passive candidates before pattern checking. Explicit bypass/capCluster and component-to-pin assignments take precedence over families: a capacitor assigned to a different consumer cannot be borrowed just because it shares power and ground. Unassigned passives on shared supplies use their functional family. A uniquely owned supply or a private signal connection can cross an incorrect DSL boundary. This filtering is used by graph motifs and the supply-group checks, rather than special-cased for LDO. Equivalent rail-bank members form alternatives for a complete motif: one finding is emitted for the best unsatisfied alternative, or none if a complete alternative is satisfied. Different capacitors cannot contribute opposite ends of a critical loop to create a passing alternative.

Optional editor grouping is a second argument with the exported `PcbSchematicGroups` contract: `validatePcbLayoutIntent(input, { groups: [{ components: ["U1", "C1", "C2"] }] })`. `incomplete: true` indicates a partial or unavailable read. Component arrays contain physical circuit designators, not editor strings or multipart references. EasyEDA always requests full schematic groups and translates its own transport format into this contract before calling the backend; the LLM still supplies only the DSL file. Backend callers may omit it. `PCB_SCHEMATIC_GROUP_MISMATCH` is info when a suggested schematic group spans separate functional families. Satellites are folded into their root; connector-only separation is ignored. Duplicate groups are collapsed, and overlapping, unknown-member or oversized groups are skipped. Partial/unavailable editor grouping produces coverage info. Heuristic group comparisons never satisfy or suppress topology obligations.

Optional `wireIslands` contains `{ net: string | null, pins: CircuitPinRef[] }` with actual schematic pin identities. The EasyEDA adapter resolves wire pin references separately from symbol-section references. Recognition uses small, electrically consistent, non-return islands with one active core to identify otherwise unassigned rail passives. Explicit DSL ownership takes precedence, then unique wire ownership, then ordinary family evidence; private signal/uniquely owned supply connections remain valid across wrong family boundaries. Separate islands with the same net name are never merged. Multiple owners, large islands, unknown pins, mixed nets and partial context cause abstention. Wires do not establish PCB pad locality or replace distributed supply-pin assignments. Contradictory explicit ownership produces `PCB_SCHEMATIC_WIRE_OWNER_MISMATCH` info; contradictory family membership produces `PCB_SCHEMATIC_WIRE_FAMILY_MISMATCH` info unless the heuristic-group check already reports the same separation.

The same input produces stable sorted diagnostics; caller inputs are not mutated. The validation VM disables ambient Date and Math.random. Ordinary deterministic JavaScript calculations and loops remain supported. The production runner itself is unchanged. No footprint lookup, placer, native evaluator or scoring path runs.

## Mechanics

`PCB_INTENT_CONNECTOR_PLACEMENT` is always a warning. J/P/CN prefixes, descriptive connector labels and DSL connector roles identify connectors. A connector needs fixed(), edgeMount(), edgePlace() or a selected preserved position. Fixed positions farther than a 5 mm perimeter guideline also warn; outline cutouts count. Supplied footprint bounding boxes, shared board/fixed geometry helpers and F32 tolerance are reused. Without a footprint the message identifies a center estimate; without an outline proximity cannot be verified. An intentional internal header may warn.

`PCB_INTENT_MOUNTING_HOLES` is board-level info when no boardHole declaration or identified mounting-hole component exists. One hole suffices. MH designators and explicit mounting/mount/screw-hole labels count; vias, ordinary drilled pads and H prefixes alone do not. Explicit connector roles override the heuristic. This check sees the complete schematic during previews; outline preservation alone does not imply existing holes.

## Extending the catalog

`src/pcb-layout/intent-validation/patterns/` has one TypeScript file per pattern containing its topology and optional check. Add its import to the single `registry.ts`. Common graph matching, candidate ownership and locality checks are shared. Use `local: true` for a terminal-level obligation, or `local: "group"` only when a small dedicated family is enough for ordinary locality. `detectCircuitPatterns({ circuit, footprints? })` reuses the same registry and recognition helpers without executing DSL; without authored rules it returns schematic topology candidates. Its result exposes matched components, roles, pins, nets and requirements for a future draft generator. This change does not add a draft generator or auto-fixes.

There are 57 checks. Five former checks based only on supplied application profiles (antenna-region, isolation-domains, cold-junction, temperature-placement and magnetic-sensor) were removed. Their required purpose, target or safety clearance cannot be established from the current input. Manual channel maps, protection sides, branch-length tolerances and preferred gate-resistor sides were removed as well. Remaining application-specific motifs require clear schematic evidence; absence of such evidence is not proof of correctness.

| # | ID | Pattern |
|---|---|---|
| 1 | ac-coupling-pair | Differential AC coupling |
| 2 | active-filter | Active analog filter |
| 3 | active-oscillator | Active oscillator |
| 4 | adc-reference | ADC reference capacitor |
| 5 | boost-loop | Boost output loop |
| 6 | bootstrap | Bootstrap capacitor |
| 7 | buck-boost-loops | Four-switch buck-boost |
| 8 | buck-loop | Buck commutation loop |
| 9 | bulk-local-caps | Bulk and high-frequency capacitors |
| 10 | can-split-termination | CAN split termination |
| 11 | charge-pump | Charge-pump flying capacitor |
| 12 | common-mode-choke | Common-mode choke |
| 13 | compensation | COMP network |
| 14 | connector-placement | Connector mechanical placement |
| 15 | controller-bias | Controller power and bias |
| 16 | crystal | Crystal oscillator |
| 17 | dc-feedback | DC feedback divider |
| 18 | differential-adc-filter | Differential ADC RC |
| 19 | differential-amplifier | Discrete differential amplifier |
| 20 | distributed-supply | Distributed supply pin groups |
| 21 | driver-decoupling | Driver decoupling |
| 22 | driver-return | Gate driver return |
| 23 | esd-entry | Connector ESD protection |
| 24 | ethernet-magnetics | Ethernet magnetics |
| 25 | filtered-supply | Filtered supply decoupling |
| 26 | flyback-primary | Flyback primary |
| 27 | flyback-secondary | Flyback secondary |
| 28 | gate-resistor | Gate series resistor |
| 29 | gate-split-resistors | Split turn-on/off paths |
| 30 | high-impedance-divider | High-impedance ADC divider |
| 31 | inductive-clamp | Inductive load clamp |
| 32 | instrumentation-gain | Instrumentation gain resistor |
| 33 | internal-regulator-cap | VCAP/VREG capacitor |
| 34 | ldo-caps | LDO input/output capacitors |
| 35 | miller-clamp | Miller clamp |
| 36 | mounting-holes | Board mounting holes |
| 37 | opamp-feedback | Op-amp feedback |
| 38 | opto-feedback | Optocoupler feedback |
| 39 | parallel-gates | Parallel MOSFET gate resistors |
| 40 | pll-filter | PLL loop filter |
| 41 | qspi-flash | QSPI/OSPI flash |
| 42 | receiver-termination | Receiver parallel termination |
| 43 | reference-buffer | Reference buffer |
| 44 | repeated-port-protection | Repeated connector protection |
| 45 | rf-balun | RF balun |
| 46 | rf-matching | RF matching network |
| 47 | rs485-termination | RS485 termination |
| 48 | sar-input-filter | SAR ADC input RC |
| 49 | sense-input-filter | Sense amplifier filter |
| 50 | sepic-loop | SEPIC transfer loop |
| 51 | shared-rail-consumers | Multiple consumers on one rail |
| 52 | shunt-kelvin | Current shunt Kelvin sense |
| 53 | snubber | Switch snubber/clamp |
| 54 | source-termination | Source series termination |
| 55 | supply-domains | Separate IC supply domains |
| 56 | transimpedance | Transimpedance amplifier |
| 57 | usb-series-pair | USB 2 series resistors |

## Debug command

Run `npm run debug:pcb-validation -- <fixture>`, `--all` for a batch, or `--code placement.js --circuit circuit.json` for standalone input. Optional flags: `--footprints <json>`, `--existing-placement <json>`, `--output-dir <directory>`, `--list`, `--strict`. The command saves diagnostics.json, summary.json, summary.md and exact input snapshots under debugging/pcb-validation. Existing placement is loaded automatically when a fixture supplies it. Errors fail; warnings fail only with --strict; info never fails. Exit 2 reports file/argument failures.

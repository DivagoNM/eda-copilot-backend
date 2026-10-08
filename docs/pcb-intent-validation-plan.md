# PCB DSL intent validation implementation plan

Status: **PARTIAL** in branch `feat/pcb-intent-validation`. The second implementation pass expands the semantics of all 60 catalog entries and closes the concrete omissions listed in the first audit. Coverage is still bounded by the implemented graph variants and by what the existing DSL can express; this is not a claim that every possible circuit in each family is supported. The first completion statement was too broad.

## Scope and public contract
- Export synchronous `validatePcbLayoutIntent({ code, circuit, footprints?, existingPlacement?, knowledge? })`.
- Return a JSON array: `{ code, severity, message, context?: { components?, locations? } }`.
- Every diagnostic message is English. Codes are stable machine identifiers; severity is error/warning/info.
- Export reusable deterministic `detectCircuitPatterns` separately. Detection returns roles, pins, nets and explicit placement obligations, without generating or applying DSL.
- Draft generation and automatic fixes remain future consumers of detection; this task does not change AutoPlace scoring/search or apply fixes.
- Use the existing executable DSL runner, schema, preserved-board processing, preview filter and structural/localLayout checks. Capture source positions only when requested; subtract strict-mode and localLayout preamble lines.
- Preserve current caller behavior and production output; no added global strict-mode directive. The runner already uses strict mode.

## Implementation rules
1. Read repository/module AGENTS.md, architecture map, existing patterns, CHANGELOG and numeric contract before editing (done).
2. New branch before code; Conventional Commits for plan, implementation and verification.
3. One file per pattern, explicit registry; shared graph/role recognizers separate from placement checkers. Patterns may overlap and cross DSL block boundaries.
4. Deterministic matching; exact net identities, string/number pin identity normalization only, stable sorting/deduplication. Never equate AGND/PGND by name.
5. Recognize connectivity plus confirmed functions. U+L+D alone is not proof of a converter. No model-number guesses, LLM calls, footprint downloads or network dependencies.
6. Pin names provide conservative standard aliases; caller-supplied knowledge provides verified kind/functions and application/mechanical context. Unknown/ambiguous function is skipped, not passed.
7. Report missing data/limited coverage explicitly in an aggregated info diagnostic. The catalog covers all 60 below, but context-dependent checks run only with the prerequisites in the table.
8. Core motifs should survive absent optional support. Do not diagnose every unrecognized passive as missing.
9. Compare intent semantically: criticalPair, signalPath/core pairs, pin-specific locality, bypass/capCluster and authored localLayout. A block/center relation alone does not prove pad locality.
10. Hard is an amplified solver preference, not proof of routed loop area, clearance or electrical correctness. No guessed universal distances, priorities, timing or normative isolation clearance.
11. Validate malformed/contradictory declarations separately from advisory layout concerns. User input errors become diagnostics; unexpected implementation failures must propagate.
12. Optional context contains relevant components and authored DSL locations, never raw JS stack. Loop/function calls retain authored call-site positions.
13. Supplied footprint geometry uses existing F32 arithmetic/tolerance. No schematic coordinates used as PCB geometry; no TS score or native weight changes.
14. No input mutation, native solver initialization, placement execution or caches in validation.
15. Structural checks use the same production validation rules, including arbitrary-role fixed poses and preview filtering. Preserve fixture DSLs and authored locked placement.
16. Tests: positive/negative motifs, every catalog entry, wrong target, equivalent intent, overlap, reordered input, ambiguous pins, exact nets, localLayout and source offsets; then typecheck, build and repository suites.
17. Update CHANGELOG and API documentation; record actual implemented checks and remaining limits rather than calling future routing checks complete.
18. PCB owns these patterns. Recognition lives in `src/pcb-layout/intent-validation/recognition/`; it is separate from schematic drawing patterns in `src/circuit-layout/patterns/`. Do not create a general pattern subsystem at the `src` root.

## Additional pattern requested on 2026-10-08

- `connector-placement` is the 61st registered pattern, added after the original 60-pattern catalog and audits below. User confirmed that a `fixed()` position far from the edge must also warn.
- Recognize J/P/CN, explicit DSL connector roles or verified connector kinds independently of electrical connectivity. Explicit role hints apply only to opting-in catalog nodes; verified kinds override guesses. Keep reusable recognition and placement checking in separate registered PCB files.
- Emit only English `warning` diagnostics with code `PCB_INTENT_CONNECTOR_PLACEMENT`, component context and available DSL locations. Check missing fixed/mechanical edge binding, explicit edgePlace inset and authored fixed/preserved perimeter proximity with a 5 mm advisory guideline. Use shared board, fixed-placement, rotation, source-coordinate and F32 geometry helpers; include polygon cutouts and footprint bounding boxes when supplied.
- Treat `edgeMount()`/`edgePlace()` as mechanical binding; soft edge hints and localLayout do not establish fixation. Preserve context and preview selection must match production semantics. State center-only or missing-outline limits explicitly. Internal connectors remain advisory; do not change solver scores or certify housing/mating access.
- Verify separate connector matches, lookalikes/profile overrides, warnings only, source context, fixed/edge equivalence, far positions, polygon cutouts, large source offsets, rotations, preservation, unavailable data and numeric boundaries.
- Verification: `pcb-intent-connector`, `pcb-intent-patterns`, `pcb-intent-validation` and `pcb-intent-cli` suites passed **181/181** tests, including 17 focused connector tests; `npm run typecheck` and `npm run build` passed. Evidence logs are local under `debugging/pcb-intent-connector-final.log` and `debugging/pcb-intent-connector-build.log`.

## Mounting-hole presence requested on 2026-10-08

- `mounting-holes` is the 62nd registered pattern. Emit one English `PCB_INTENT_MOUNTING_HOLES` **info** if there is no identified mounting hole; one hole suffices. Keep the board requirement, recognizer helper and checker separately reusable under PCB intent validation.
- Accept `boardHole()`/`boardHole.corners()`, MH designators, explicit mounting/mount/screw-hole labels in schematic/footprint metadata and verified `kind: 'mounting-hole'`. Verified non-hole kinds and explicit connector roles override naming guesses. Do not infer mounting from H alone, generic drills/vias, boardPad holes or through-hole connector pads.
- Inspect the full schematic during previews. Existing outline data alone cannot prove drilled mounting holes; preserved identified hole components count. Keep alternative mounting methods advisory and leave hole positioning, dimensions, casing fit and final placement outside this presence check.
- Verify absence severity/message, single and corner holes, symbols/footprints/profiles, lookalikes, profile/role overrides, preview/preserve scope, deterministic matches and no mutation. Info must not fail strict CLI validation.
- Verification: **192/192** focused tests passed across the intent pattern/validation/connector suites (176) and mounting-hole/CLI suites (16, including nine mounting-hole tests and strict-mode info coverage). `npm run typecheck` and `npm run build` passed. Regression/build evidence is local under `debugging/pcb-intent-mounting-regression.log` and `debugging/pcb-intent-mounting-build.log`.

## Catalog (original 60 patterns)
Connectivity means graph recognition. Device/application knowledge means an explicit confirmed profile, not a guessed part identity.
| # | ID | Pattern | What to check | Prerequisites |
|---|---|---|---|---|
| 1 | distributed-supply | Distributed supply pin groups | Capacitors serve every physical supply group, rather than one distant pin. | Footprint pad groups or confirmed supplyGroups |
| 2 | shared-rail-consumers | Multiple consumers on one rail | Local capacitors are assigned to each IC sharing a rail. | Named supply/return pins |
| 3 | supply-domains | Separate IC supply domains | VDDA, VDDIO and core capacitors target their respective pins. | Named supply pins and distinct nets |
| 4 | filtered-supply | Filtered supply decoupling | Capacitor after a bead/resistor targets the downstream consumer. | Two-pin filter and supply/return pins |
| 5 | bulk-local-caps | Bulk and high-frequency capacitors | A bulk capacitor does not determine placement of all local capacitors. | Confirmed bulk/local capacitor roles |
| 6 | controller-bias | Controller power and bias | PVIN/AVIN and bias capacitors have distinct targets. | Named PVIN/AVIN/BIAS pins |
| 7 | ldo-caps | LDO input/output capacitors | Both capacitor branches target the correct regulator pins. | Confirmed LDO kind and IN/OUT/GND |
| 8 | internal-regulator-cap | VCAP/VREG capacitor | Internal regulator capacitor is kept at VCAP/VREG, not VDD. | Named internal regulator pin |
| 9 | buck-loop | Buck commutation loop | CIN, switch/diode and switch node have pad-level relations. | Confirmed buck or SW/VIN/GND plus connected L/diode |
| 10 | boost-loop | Boost output loop | Switch, rectifier and COUT form a local output loop. | Confirmed boost kind and connected switching graph |
| 11 | buck-boost-loops | Four-switch buck-boost | Two switching areas have distinct input/output loops. | Confirmed topology and SW1/SW2/VIN/VOUT |
| 12 | sepic-loop | SEPIC transfer loop | Transfer capacitor and both inductive branches retain their topology. | Confirmed SEPIC and connected graph |
| 13 | flyback-primary | Flyback primary | Primary winding, switch and local input/sense support remain local. | Confirmed transformer winding roles and flyback primary |
| 14 | flyback-secondary | Flyback secondary | Secondary winding, rectifier and output capacitor remain local. | Confirmed winding roles |
| 15 | dc-feedback | DC feedback divider | Divider midpoint targets FB rather than power output. | FB pin and two-resistor divider |
| 16 | compensation | COMP network | Compensation RC targets COMP and its actual return. | COMP pin and connected RC |
| 17 | snubber | Switch snubber/clamp | RC/RCD/TVS support targets its actual switch endpoints. | Confirmed switch/snubber roles |
| 18 | charge-pump | Charge-pump flying capacitor | Flying capacitor targets both charge-pump pins. | C+/C- or confirmed flying-cap pins |
| 19 | gate-resistor | Gate series resistor | Each resistor targets its actual gate/driver branch. | OUT and G/S/D or confirmed functions |
| 20 | gate-split-resistors | Split turn-on/off paths | R and R+D branches remain attached to the same gate. | Named gate plus branch graph |
| 21 | driver-return | Gate driver return | Driver return references source/emitter or Kelvin source. | Confirmed driver output/return and device pins |
| 22 | driver-decoupling | Driver decoupling | Local VDD-to-VSS/VEE capacitor targets the driver. | Confirmed gate-driver kind |
| 23 | bootstrap | Bootstrap capacitor | BOOT/HB-to-SW/HS capacitor targets both pins and is not ground bypass. | Named BOOT/HB and SW/HS |
| 24 | parallel-gates | Parallel MOSFET gate resistors | Each parallel MOSFET has its own local gate resistor. | G/S/D and separate resistor paths |
| 25 | miller-clamp | Miller clamp | CLAMP-to-gate relationship stays local. | Named CLAMP and gate |
| 26 | inductive-clamp | Inductive load clamp | Flyback diode/TVS stays at load loop. | Confirmed load and clamp roles; external mechanics if needed |
| 27 | opamp-feedback | Op-amp feedback | Feedback resistor/capacitor targets the correct IN- and OUT channel. | Unambiguous channel pin functions |
| 28 | transimpedance | Transimpedance amplifier | Detector and feedback remain at sensitive inverting input. | Confirmed photodiode/current-source and amplifier pins |
| 29 | instrumentation-gain | Instrumentation gain resistor | Gain resistor targets both RG pins. | Named RG pair |
| 30 | differential-amplifier | Discrete differential amplifier | Resistor branches target their own amplifier inputs. | Confirmed amplifier channels and paired resistor graph |
| 31 | active-filter | Active analog filter | Sallen-Key/MFB RC networks retain their functional grouping. | Confirmed active-filter function |
| 32 | sar-input-filter | SAR ADC input RC | Shunt capacitor targets the ADC side of the series resistor. | Confirmed SAR/ADC and input pin |
| 33 | differential-adc-filter | Differential ADC RC | Both input branches and differential capacitor target ADC inputs. | Confirmed ADC and IN+/IN- |
| 34 | adc-reference | ADC reference capacitor | REF charge-storage capacitor is kept at REF. | Confirmed ADC and REF pin |
| 35 | reference-buffer | Reference buffer | Reference buffer feedback/capacitor serves the ADC reference. | Confirmed reference buffer and ADC |
| 36 | high-impedance-divider | High-impedance ADC divider | Midpoint/filter targets the receiver rather than measured source. | Confirmed high-impedance sense application |
| 37 | shunt-kelvin | Current shunt Kelvin sense | Both sense branches target distinct shunt terminals. | Confirmed shunt and sense amplifier |
| 38 | sense-input-filter | Sense amplifier filter | Input resistors/differential capacitor target amplifier inputs. | Confirmed current-sense amplifier |
| 39 | crystal | Crystal oscillator | Each crystal/load-cap branch targets its OSC pin. | Two-pin crystal and OSCIN/OSCOUT functions |
| 40 | active-oscillator | Active oscillator | Oscillator has its own decoupling and output-consumer relation. | Confirmed oscillator, VDD/GND/OUT |
| 41 | source-termination | Source series termination | Series resistor targets the confirmed source. | Confirmed source termination/application direction |
| 42 | receiver-termination | Receiver parallel termination | Termination targets the declared receiver/end. | Confirmed receiver termination/application endpoint |
| 43 | pll-filter | PLL loop filter | Charge-pump and tuning endpoints retain RC topology. | Confirmed PLL, CP and VTUNE |
| 44 | qspi-flash | QSPI/OSPI flash | Memory/MCU clock-data grouping respects declared speed needs. | Confirmed memory interface/profile |
| 45 | esd-entry | Connector ESD protection | Ordinary TVS protection stays at the correct connector. | Confirmed ESD protection; Ethernet excluded by profile |
| 46 | common-mode-choke | Common-mode choke | Coupled pair retains both branches and protocol order. | Confirmed coupled winding functions/protocol |
| 47 | ac-coupling-pair | Differential AC coupling | Pair capacitors serve their respective branch endpoints. | Confirmed differential transmitter/application placement side |
| 48 | ethernet-magnetics | Ethernet magnetics | PHY, magnetics, center taps and RJ45 remain on correct sides. | Confirmed PHY/magnetics; integrated MagJack profile |
| 49 | can-split-termination | CAN split termination | Two termination resistors and midpoint capacitor target bus endpoint. | Confirmed CAN endpoint |
| 50 | rs485-termination | RS485 termination | A/B resistor targets the declared bus end. | Confirmed RS485 endpoint; no assumption every node terminates |
| 51 | usb-series-pair | USB 2 series resistors | Required DP/DM series resistors target corresponding PHY pins. | Confirmed USB profile requiring series resistors |
| 52 | repeated-port-protection | Repeated connector protection | Each port keeps its own protection/filter support. | Confirmed protection and multiple connectors |
| 53 | rf-matching | RF matching network | Series/shunt L/pi/T paths target actual RF endpoint. | Confirmed RF matching function |
| 54 | rf-balun | RF balun | Differential and single-ended branches remain coherent. | Confirmed balun and RF pin roles |
| 55 | antenna-region | Antenna region | Radiating region has authored placement/orientation/keepout intent. | Confirmed antenna/module mechanical profile |
| 56 | isolation-domains | Isolation barrier | Local groups do not cross declared domains; separation is authored. | Explicit isolation domains/clearance profile |
| 57 | opto-feedback | Optocoupler feedback | Support targets LED/transistor side and declared domain. | Confirmed optocoupler A/K/C/E roles |
| 58 | cold-junction | Cold-junction sensor | CJC sensor targets thermocouple contacts. | Confirmed thermocouple connector and CJC sensor |
| 59 | temperature-placement | Temperature sensor purpose | Ambient sensor separates from heat; monitored sensor targets its object. | Explicit ambient/monitored role and heat/target component |
| 60 | magnetic-sensor | Magnetic sensor | Sensor targets declared mechanics and separates from unrelated sources. | Explicit magnetic target/interference profile |

## Work sequence
- [x] Read instructions and existing architecture; create branch.
- [x] Save all agreed patterns and rules before implementation.
- [x] Build minimal public contracts, shared graph context, role resolution, deterministic registry.
- [x] Add 60 conservative recognizers with explicit prerequisites and independent checker modules.
- [x] Implement the concrete missing semantics from the first audit: additional graph variants, channel binding, Kelvin endpoints, memory buses, declared mechanical intent, isolation domains and authored geometry.
- [ ] Exhaustive coverage of arbitrary topology variants remains open; supported variants and the duplicate-physical-pad DSL boundary are documented explicitly.
- [x] Reuse structural runner path; capture optional DSL positions; compare equivalent authored relations.
- [x] Add meaningful regressions and public export tests.
- [x] Add independent circuit examples, missing/wrong intent cases and successful corrections for the expanded checks, including declared geometry and coverage limits.
- [x] Typecheck, build, focused tests, broad-suite attempt and baseline comparison; inspect diff; Conventional Commits.
- [x] Document observed limitations and final verified behavior.

## Completion audit (2026-10-08)
The table below compares the implementation with the original catalog. A checked core motif is not a claim that its entire family is complete. Prerequisite knowledge is deliberately required where appropriate; missing implemented semantics are separate from missing caller data.
All 60 entries were reviewed again after the second pass. The original 97-test result is retained below as history; current targeted verification is recorded separately. These checks cover the stated variants and declared intentions, not unrestricted circuit-family recognition.

| Pattern | Implemented scope / outstanding work |
|---|---|
| distributed-supply | Verified physical groups are checked. Footprint fallback now targets every represented logical supply pin separately, including far-apart pins on the same side; adjacent pins may share an explicit group. Repeated physical pads have logical-pin coverage and an info limitation because the DSL cannot address individual duplicate pads. |
| shared-rail-consumers | Each identified consumer sharing a supply rail needs its own local capacitor anchor; known supply/return functions remain prerequisites. |
| supply-domains | Different named physical/function domains need distinct targets even when VDDA/VDDIO share the same net. |
| filtered-supply | Downstream capacitor targeting includes VDD, VCC, VDDA, VDDIO, VCORE, AVIN and BIAS aliases. |
| bulk-local-caps | Local capacitor targeting and mixed bulk/local rigid localLayout groups are checked separately. |
| controller-bias | PVIN, AVIN and BIAS groups are checked separately, including repeated functions and shared rails. Any electrically appropriate capacitor may satisfy its own group; arbitrary capacitor-role permutations no longer require every capacitor at every pin. |
| ldo-caps | Confirmed LDO input/output capacitor branches are checked; verified channels can bind repeated regulator functions. |
| internal-regulator-cap | VCAP/VREG capacitor targeting uses the actual internal-regulator pin and return net. |
| buck-loop | Integrated switching core, optional external diode, external asynchronous switch and synchronous half-bridge are recognized. External variants currently require directly connected named gate outputs. |
| boost-loop | Integrated-switch and external-switch diode/output-capacitor loops are recognized; external gate connection is direct. |
| buck-boost-loops | Integrated SW1/SW2 and external four-switch half-bridges have separate input/output commutation obligations; external gate connections are direct. |
| sepic-loop | Separate inductors and confirmed coupled-inductor winding roles are supported. External-switch controllers without an identifiable SW endpoint need another graph variant. |
| flyback-primary | Winding/switch/input-capacitor and source-shunt/controller-sense variants are supported. Confirmed flyback controllers may declare quiet-controller avoidance and a supplied distance. |
| flyback-secondary | Diode and confirmed low-side synchronous-switch variants are supported; the synchronous-switch application tag is required. |
| dc-feedback | Divider midpoint targets FB; overlapping support motifs do not consume the divider. |
| compensation | Series, parallel and direct-capacitor COMP support is recognized. FB and REF/VREF returns have additional series/direct-capacitor variants. Arbitrary higher-order networks outside these motifs remain outside coverage. |
| snubber | Both RC orders, RCD across a switch, flyback RCD returning to the primary rail and confirmed TVS clamps are supported. |
| charge-pump | Every declared channel keeps its own flying-capacitor pair; channel maps prevent unrelated pairs from being mixed. |
| gate-resistor | Driver/resistor/device branch is checked. A confirmed preferredGateResistorSide selects the driver or device anchor without inventing a universal distance. |
| gate-split-resistors | Both diode orientations and directly connected separate on/off driver outputs are supported. |
| driver-return | Ordinary MOSFET source, dedicated Kelvin source, IGBT emitter and dedicated Kelvin emitter are supported; dedicated terminals take precedence over power terminals sharing the same net. |
| driver-decoupling | Confirmed driver supply/return capacitor targeting is checked. |
| bootstrap | Both capacitor endpoints are checked against BOOT/HB and SW/HS; unrelated bypass nets are rejected. |
| parallel-gates | Each MOSFET has its own resistor anchor. A declared branchLengthTolerance checks authored pad spans using complete poses/layers/footprints; unavailable geometry produces info. |
| miller-clamp | Confirmed CLAMP-to-gate locality is checked. |
| inductive-clamp | Flyback diode and confirmed TVS load clamps are supported. An external-load profile may bind the clamp to a connector/mechanical target. |
| opamp-feedback | Both resistor and capacitor feedback are supported; verified channels prevent OUT/IN pairs from crossing between channels. |
| transimpedance | Photodiode and confirmed current-source variants include optional parallel feedback capacitance. |
| instrumentation-gain | Both confirmed RG endpoints are checked. |
| differential-amplifier | Resistor/input branches and verified amplifier channels are supported. Declared span symmetry needs confirmed differential-input/differential-return roles to distinguish the signal resistor from its return resistor. |
| active-filter | Declared Sallen-Key and low-pass MFB motifs are supported; unrelated filter architectures need another explicit variant. |
| sar-input-filter | ADC-side series resistor and shunt capacitor targeting are checked. |
| differential-adc-filter | Differential capacitance and paired common-mode capacitors are supported. |
| adc-reference | Direct ADC reference capacitor targeting is checked. |
| reference-buffer | Direct follower and resistive-feedback reference buffers are supported; more complex buffer architectures need explicit variants. |
| high-impedance-divider | Declared ADC divider midpoint/filter targeting is checked. |
| shunt-kelvin | Two-terminal and four-terminal shunts, direct and through two sense-filter resistors, are supported. Force terminals cannot satisfy dedicated sense-terminal obligations on the same net. |
| sense-input-filter | Confirmed sense amplifier input resistors and differential capacitor are checked. |
| crystal | Both oscillator branches and optional load capacitors are checked, with verified channels available for ambiguous devices. |
| active-oscillator | Confirmed oscillator bypass and clock-consumer locality are checked. |
| source-termination | The confirmed source-side resistor anchor is checked. |
| receiver-termination | Single-ended and direct differential termination are supported; endpoint/application facts remain explicit. |
| pll-filter | Integrated PLL, separate VCO and two-stage RC-to-VCO filter motifs are supported. Other filter architectures need explicit variants. |
| qspi-flash | Named clock/data/select grouping, QSPI/OSPI endpoint maps, one unambiguous series resistor per signal and declared minimumPriority are checked. Level shifters and longer/ambiguous series chains are outside these variants; incomplete functional naming is reported as coverage info. |
| esd-entry | Ordinary protection includes explicitly mapped array channels; ethernet-protection is excluded from the ordinary connector-anchor rule. |
| common-mode-choke | Both winding branches and confirmed receiver endpoints are checked. entryChain declares the connector/receiver/protection side and validates its connectivity; no universal protocol ordering is invented. More complex chains need another variant/profile. |
| ac-coupling-pair | Confirmed transmitter-side and receiver-side profiles are supported. A declared tolerance can compare authored branch spans; this is not routed skew measurement. |
| ethernet-magnetics | Discrete magnetics, PHY center-tap capacitor, line-side termination/chassis capacitor and integrated MagJack variants are supported. Support tags must describe the actual winding side. |
| can-split-termination | Both resistors and midpoint capacitor at the confirmed endpoint are checked. |
| rs485-termination | Confirmed endpoint resistor locality is checked; electrical completeness of missing termination remains outside intent validation. |
| usb-series-pair | Both required PHY-side resistor branches are checked under the confirmed USB profile. |
| repeated-port-protection | Repeated discrete protection, one multi-line protection array and confirmed repeated connector filters are supported. |
| rf-matching | Series/shunt, pi and T networks are supported under confirmed series/shunt application tags. |
| rf-balun | Differential branches and a confirmed single-ended RF endpoint are supported. |
| antenna-region | Declared target/avoid/edge, rotation restriction and named keepout dimensions/layers/allowed blocks are checked. Final radiating geometry/copper coverage is not certified. |
| isolation-domains | Declared separation, mixed rigid localLayout groups and exact nets joining distinct declared domains are checked. Bridging components can declare per-pin domains. |
| opto-feedback | Support anchors use actual LED/collector pins. Per-pin isolation domains identify each side and detect support/net assignments crossing declared domains. |
| cold-junction | Confirmed CJC-to-contact targeting is checked; declared alignment can validate common-frame authored positions. |
| temperature-placement | Ambient avoidance and monitored-object targeting use declared application/heat-source facts; declared alignment is optional. |
| magnetic-sensor | Declared target/avoid/rotation and center alignment with an explicit offset/tolerance are checked. Unknown authored geometry produces info rather than a pass. |

## Implemented scope and verification (2026-10-08)
- All 60 entries have independent authored recognition examples and missing-intent checks. This is core motif/locality validation, not a full electrical or physical verifier for every topology variation; see `pcb-intent-validation.md`.
- Recognition and checkers both belong to `pcb-layout/intent-validation`. The recognition API remains reusable for a future PCB DSL generator. Existing schematic pattern implementations were not changed.
- `npm run typecheck`: passed after relocation. `npm run build`: passed; built `dist/pcb.js` exports both APIs and returns structured invalid-input diagnostics.
- Focused final command: `node --import tsx --test tests/pcb-intent-patterns.test.ts tests/pcb-intent-validation.test.ts tests/pcb-local-layout.test.ts tests/pcb-provided-footprints.test.ts`: **97 passed**, including 89 new tests.
- New regressions include 60 positive/profile examples, broken connectivity, order stability, no mutation, pin aliases, exact ground-net identity, equivalent hints/paths/localLayout, distributed supply pin groups, source offsets, synthetic boardPad targets, incorrect bypass nets, isolation group/all semantics, preview/preserve, ambiguous channels, observer failure propagation and execution timeout.
- Offline real-circuit smoke checks used unchanged ESP32_C3_MAN (107 components) and Portable_AC_DC_Telemetry (154 components) DSL/netlists. Structural checks passed and produced bounded intent warnings/coverage info. USB_ISOL (24 components) surfaced the existing block-connectivity structural error. No placement run or footprint download was performed for these smoke checks.
- Broad `npm run check` passed typecheck/build, then reported **504 passed, 14 failed, 40 skipped** (558 tests; approximately 299 seconds). This was before the final seven additional focused regressions. The complete repository suite is **not green**.
- Compared with an archived `main` snapshot at `0353f7a03972c85e534ddc70715fb00f52de424f`, using the same native addon and a dependency junction. The main full attempt reported 404 passed, 18 failed, 39 skipped; it additionally lacked some generated build assets, so its total is not directly comparable.
- Eleven of the fourteen branch failure titles reproduced in that main full attempt: core pair packing/balancing, grid clearance, alternate module order, captured USB baseline, Telemetry alignment, through-hole export, empty/locked GPU initialization, both mixed-side spacing tests, and RF signal-path placement.
- The remaining three titles (parallel block hypotheses, USB combined experiment and full-branch USB legality) reproduced on main in a targeted run of `tests/pcb-block-experiments.test.ts` with `--test-name-pattern='parallel block hypotheses preserve|USB combined experiment shortens|full branch profile preserves USB'`: 3 failed, after restoring the archived scripts required by the replay helper. All 14 failure titles therefore occur on main as well. Exact native experiment outcomes differ between full/isolated runs; this is evidence of pre-existing failures, not a green baseline or a diagnosis of their root causes.
- Raw local evidence stays ignored under `debugging/pcb-intent-*.log`. No unrelated native/scoring changes were made to force the broad suite green.

## Remaining scope limits
- The catalog implements the concrete graph variants in the audit, rather than every possible circuit belonging to the 60 broad families. External gate resistors in controller power-stage graphs, externally switched SEPIC without a named SW endpoint, arbitrary higher-order compensators/filters, memory level shifters and more complex protocol chains may need additional variants. Confirmed channels/roles cannot substitute for an unimplemented electrical graph.
- Footprint fallback is conservative per logical supply pin. Nearby pins may share an explicitly verified group. Individual repeated physical pads cannot be distinguished by the current DSL pin target; coverage info states this boundary.
- Authored symmetry/alignment checks use declared tolerances, common-frame positions and F32 arithmetic. Pad spans require explicit component layers and unambiguous supplied pads. They are not final placement or routed length measurements. Missing/ambiguous data is reported, not considered a pass.
- A named keepout checks the authored region, dimensions, layers and exceptions. Its physical overlap with a radiating region and final copper/manufacturing clearance remain outside this API.
- Draft DSL generation and automatic fixes are not part of this implementation.

## Research references and boundaries
- [TI switching layout](https://www.ti.com/document-viewer/lit/html/ssztau6), [four-switch converter](https://www.ti.com/document-viewer/lit/html/SSZTAE5/GUID-1402DA8B-73DB-44B4-B203-A3AF307A6C45).
- [TI gate-driver layout](https://www.ti.com/document-viewer/lit/html/SLUAAM3), [parallel MOSFETs](https://www.ti.com/lit/ab/slvaf39a/slvaf39a.pdf), [charge pumps](https://www.ti.com/lit/an/snva778/snva778.pdf).
- [ADI SAR input filters](https://www.analog.com/en/resources/analog-dialogue/articles/front-end-amp-and-rc-filter-design.html), [instrumentation amplifiers](https://www.analog.com/media/en/training-seminars/design-handbooks/designers-guide-instrument-amps-complete.pdf), [ST crystals](https://www.st.com/resource/en/application_note/an2867-oscillator-design-guide-for-stm8afals-stm32-mcus-and-mpus-stmicroelectronics.pdf).
- [TI ESD placement](https://www.ti.com/lit/an/slva680a/slva680a.pdf), [Ethernet ESD exception](https://www.ti.com/lit/an/snla387/snla387.pdf), [RF placement](https://www.ti.com/lit/an/swra367a/swra367a.pdf).
- [CJC placement](https://www.ti.com/lit/ug/tiducc1/tiducc1.pdf), [temperature sensor purpose](https://www.ti.com/document-viewer/lit/html/SSZT563/GUID-4573E11C-5CAA-4F31-AD62-B31EAA287993), [Hall sensor placement](https://www.ti.com/lit/an/sboa518/sboa518.pdf).

These sources motivate motif checks, not universal geometric limits. Datasheet requirements must be supplied by a verified profile. Physical routing, EMI, return-current continuity, actual loop area, electrical values and fabrication compliance are outside intent validation.

## Second implementation pass and verification (2026-10-08)
- The concrete first-audit omissions are implemented in the existing PCB catalog files; there are still 60 registered IDs. Recognition, shared transforms and checkers remain under `pcb-layout/intent-validation`; no root circuit-pattern subsystem or native score changes were added.
- New reusable pieces include coherent channel pin sets, graph variants, direct/series memory-interface recognition, entry-chain intent, per-pin isolation domain conflict detection and authored-geometry checks. Preferred gate resistor anchors, balanced branch roles and application purposes are declared by their catalog entry rather than dispatched by ID in a central switch.
- Final targeted command: `node --import tsx --test tests/pcb-intent-patterns.test.ts tests/pcb-intent-validation.test.ts tests/pcb-local-layout.test.ts tests/pcb-provided-footprints.test.ts tests/pcb-constraint-region.test.ts`: **167 passed**. Of these, 157 exercise the intent validator/recognizers (68 more than the first pass). Expanded examples include missing/wrong anchors, corrected intent, exact sense pins, channel isolation, translated authored geometry, ambiguous/repeated pads and incomplete geometry coverage.
- `npm run typecheck` and `npm run build`: passed after the final code changes. Built `dist/pcb.js` exports both APIs and returns an English structured invalid-input diagnostic in the smoke check.
- Broad `npm run check` before the last memory/COMP/Kelvin/catalog refinements: typecheck/build passed; test summary was **573 passed, 13 failed, 40 skipped** (626 tests, approximately 223 seconds). Final refinements are covered by the targeted suite above; the broad suite was not repeated after them.
- Twelve broad failure titles belong to the placement/native failures previously reproduced on main. The additional `bounded block neighbourhoods preserve hard legality` failure passed when isolated on both the archived main and this branch with the same native addon. Its full-suite/isolated difference remains unexplained; the suite is not green and this comparison does not establish a root cause.
- Ignored evidence: `debugging/pcb-intent-expanded-{final,check,build,baseline-neighbourhood,branch-neighbourhood}.log`. No fixture DSL/netlist, native artifact or solver weight was edited to change these results.

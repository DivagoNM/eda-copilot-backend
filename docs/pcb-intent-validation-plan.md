# PCB DSL intent validation implementation plan

Status: implementation in branch `feat/pcb-intent-validation`. Authoritative checklist; updated with verification before completion.

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

## Catalog (60 patterns)
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
- [ ] Build minimal public contracts, shared graph context, role resolution, deterministic registry.
- [ ] Add 60 conservative recognizers with explicit prerequisites and independent checker modules.
- [ ] Reuse structural runner path; capture optional DSL positions; compare equivalent authored relations.
- [ ] Add meaningful regressions and public export tests.
- [ ] Typecheck, build, focused and broad tests; inspect final diff; Conventional Commits.
- [ ] Document observed limitations and final verified behavior.

## Research references and boundaries
- [TI switching layout](https://www.ti.com/document-viewer/lit/html/ssztau6), [four-switch converter](https://www.ti.com/document-viewer/lit/html/SSZTAE5/GUID-1402DA8B-73DB-44B4-B203-A3AF307A6C45).
- [TI gate-driver layout](https://www.ti.com/document-viewer/lit/html/SLUAAM3), [parallel MOSFETs](https://www.ti.com/lit/ab/slvaf39a/slvaf39a.pdf), [charge pumps](https://www.ti.com/lit/an/snva778/snva778.pdf).
- [ADI SAR input filters](https://www.analog.com/en/resources/analog-dialogue/articles/front-end-amp-and-rc-filter-design.html), [instrumentation amplifiers](https://www.analog.com/media/en/training-seminars/design-handbooks/designers-guide-instrument-amps-complete.pdf), [ST crystals](https://www.st.com/resource/en/application_note/an2867-oscillator-design-guide-for-stm8afals-stm32-mcus-and-mpus-stmicroelectronics.pdf).
- [TI ESD placement](https://www.ti.com/lit/an/slva680a/slva680a.pdf), [Ethernet ESD exception](https://www.ti.com/lit/an/snla387/snla387.pdf), [RF placement](https://www.ti.com/lit/an/swra367a/swra367a.pdf).
- [CJC placement](https://www.ti.com/lit/ug/tiducc1/tiducc1.pdf), [temperature sensor purpose](https://www.ti.com/document-viewer/lit/html/SSZT563/GUID-4573E11C-5CAA-4F31-AD62-B31EAA287993), [Hall sensor placement](https://www.ti.com/lit/an/sboa518/sboa518.pdf).

These sources motivate motif checks, not universal geometric limits. Datasheet requirements must be supplied by a verified profile. Physical routing, EMI, return-current continuity, actual loop area, electrical values and fabrication compliance are outside intent validation.


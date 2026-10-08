# PCB intent validation implementation plan

## Agreed implementation rules

- Match MakePcbLayoutInput exactly; reuse layoutSchema. No knowledge input, manual application profiles or extra LLM parameters.
- Return an array of minimal English diagnostics: code, severity, message and optional component/source context.
- Deterministic recognition from circuit connectivity, named pins, descriptive labels and existing DSL intent. No LLM, network requests, placement or native score changes.
- One pattern file per check and one registry. Reuse common recognition for the future draft generator without building an auto-fix framework now.
- Reuse production parsing, structural/localLayout checks and geometry; do not copy their validation dispatch lists.
- Preserve existing user files. Only the explicitly approved schema export and deletion of earlier validator additions may touch the old public/pipeline files.
- Conventional commits and focused verification. Keep generated evidence under ignored debugging/.

## Implementation status

- [x] Remove knowledge types/schema/input/debug option and profile-only checks.
- [x] Merge duplicate catalogs into patterns; remove wrapper-only checkers and the second registry.
- [x] Restore the four production helper files to commit 0353f7a; call existing validators directly.
- [x] Share the original layout input schema and build recognition context once per validation.
- [x] Preserve connector warnings (including fixed interior connectors) and mounting-hole info.
- [x] Cover every supply target, avoid duplicate structural diagnostics, preserve input data and deterministic ordering.
- [x] Keep independent circuit examples for all 57 retained patterns and real topology variants.
- [x] Final typecheck, build, focused production regressions, integration tool check and diff-scope audit.

Verification: 186 tests passed across the five intent suites and the existing localLayout/placement-validation suites. Backend typecheck/build and MCP typecheck passed. Both the normal MCP runtime and the bundled Skill passed four backend/stdio/CLI cases with a file-only schema, automatic editor reads and preserve context. The four production helpers match the pre-validator baseline exactly; the scope audit also verified that original public API bodies and original README/changelog text remain intact. Evidence: `debugging/intent-refactor-tests.log`, `debugging/intent-refactor-build.log`, `debugging/intent-refactor-scope.log`.

The full retained catalog, input/output contract, recognition limits and debug commands are recorded in [PCB intent validation](pcb-intent-validation.md). Removed profile-only checks are listed there explicitly; they are not silently counted as implemented.

## Retained patterns

### Shared locality follow-up

- [x] Resolve functional families from a root block and all recursive attachTo descendants.
- [x] Resolve explicit rail-passive ownership once; share candidate filtering across graph motifs and supply checks.
- [x] Preserve recognition across wrong boundaries when the signal or supply owner is unique.
- [x] Accept small dedicated families for ordinary supply locality, retaining strict critical-loop and individual supply-pin obligations.
- [x] Group equivalent rail-bank candidates and check complete alternatives; emit one finding rather than Cartesian duplicates.
- [x] Add optional backend schematic-group context; automatically read full groups in EasyEDA without changing the LLM file-only schema.
- [x] Define one backend `PcbSchematicGroups` contract with component arrays and an optional incomplete flag. Parse EasyEDA strings/multipart references in the integration adapter; backend contains no EasyEDA transport parser.
- [x] Compare schematic groups with root families as info only; skip giant, overlapping and unresolved groups.
- [x] Add structured wire islands to the shared contract; parse actual pin references only in EasyEDA. Use explicit ownership, then unique small wire islands, then families across the shared recognition path. Retain PCB locality requirements, abstain on partial/ambiguous evidence and report conflicting assignments as info.
- [x] Verify STM32 regression, other topology families, production regressions, MCP/CLI/bundled Skill, and commit only validator additions.

The previous STM32 report contained 65 warnings, including 54 LDO Cartesian duplicates. The final report has 0 errors, 9 warnings and 1 mounting-hole info, no LDO warnings, and restricts U2 candidates to C7/C8/C9. Evidence: `debugging/pcb-validation/runs/STM32G0_CAN_RS485/2026-10-08T18-28-24-605Z-nNo69N/summary.md`.

Final verification: all 217 focused backend tests passed, including 31 locality/group/wire cases and the existing localLayout/placement-validation regressions. Backend and MCP typechecks and builds passed. Both the normal runtime and the bundled Skill passed 14 independent backend/stdio/CLI cases, including exact pin-reference parsing, partial editor data, automatic reads and file-only LLM input. The scope audit confirmed the four production helpers still match `0353f7a`; old public files differ only in the validator type-export additions. Evidence: `debugging/intent-locality-tests.log`, `debugging/intent-locality-build.log`, `debugging/intent-locality-scope.log`.

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

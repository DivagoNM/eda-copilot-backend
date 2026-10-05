# ESP32_C3_MAN mechanical revision

Date: 2026-10-05. Scope: fixture DSL and its validation runner, using the current local backend source. No production solver changes or EasyEDA placement assembly.

Backend HEAD: a1c57a2e86b18f55ea3a6a37f49e7f38789d354a.
Native Windows x64 SHA-256: 49140DE6A710A10B66117560E6E88A5CCAF538845D730D4A95F1CF0B70211E9E.

The initial fixture had no locked external mechanics, an automatic 116.386 x 80.266 mm outline, a soft SW-to-L1 violation (6.364 mm versus 5 mm) and loose passive groups. Its clean geometry result did not establish connector access or an acceptable product layout.

The revision defines a 120 x 85 mm outline, four mounting holes, outward locked edge connectors, fixed controls, ESP antenna overhang, inward termination headers with shunt access, attached functional support groups, a hard SW-to-L1 pair and real PowerPAD thermal geometry. User review requested moving J3 closer to the edge; its final center is x=-56.5 mm with a 0.6 mm body-to-edge margin.

Mechanical previews run directly through local `runPcbLayout` from an ignored script in `debugging/pcb-layout/ESP32_C3_MAN-v2`. All 13 mechanical parts pass geometry and fit the mounting holes. Previews were repeated only after changes to shunt direction/access or J3. Full electrical placement is a separate check.

An initial full run with hand-authored buck localLayout seeds failed with `LOCAL_LAYOUT_LEGALIZATION_FAILED` before board placement. A revised seed attempt was stopped before completion when this approach was abandoned. The final DSL removes seeds and retains the switch-node core island and electrical constraints. Full runs are repeated only after these input changes.

Commands:

```sh
node --import tsx debugging/pcb-layout/ESP32_C3_MAN-v2/run-mechanical.ts
node --import tsx tests/pcb-layout/ESP32_C3_MAN/ESP32_C3_MAN.ts --validate
node --import tsx tests/pcb-layout/ESP32_C3_MAN/ESP32_C3_MAN.ts
```

Complete placement artifacts are written under ignored `debugging/pcb-layout/ESP32_C3_MAN`. The final runner asserts clean geometry, complete placement, exact mechanical poses and the hard switch-node bound. This fixture preserves the source's electrical anomalies; placement does not repair its schematic or certify isolation.

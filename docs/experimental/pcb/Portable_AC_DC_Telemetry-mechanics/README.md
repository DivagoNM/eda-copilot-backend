# Portable AC/DC Telemetry placement revision

2026-10-05. Fixture-only change; no production solver edits or EasyEDA assembly.
Backend HEAD a1c57a2e86b18f55ea3a6a37f49e7f38789d354a; native Windows x64 SHA-256
49140DE6A710A10B66117560E6E88A5CCAF538845D730D4A95F1CF0B70211E9E.

The initial 154-component input (33 blocks / 9 paths) reached board placement but
timed out at the shared runner's 600-second limit. Mechanics were unconstrained.
The live eight-page schematic was reread with EasyEDA CoPilot and matched every
saved component. Original JSON and PCB source remain unchanged.

The revision keeps the source 100 x 100 mm polygon and 50 x 7 mm antenna notch.
Ten interface/control/module poses are locked. The first mechanical preview
revealed incorrect KF301 facing inferred from pad asymmetry; faceAt0(top) restores
the source's outward orientations. Negative edgeMount overhang clamps to zero,
so it cannot inset the ESP relative to the notch. Final notch-relative fixed pose
(-11,36.25,0) leaves 0.5887 mm between castellated pad ends and the y=43 edge.
Mechanical previews were repeated only after these input changes and passed.

44 blocks / 12 paths now include voltage-divider and shunt Kelvin topology,
attached MCU/ADC/power support, separate level translator islands and four hard
switch-to-inductor core islands. The graph preflight passed with no unowned
components or unattached passive blocks. Ignored local-return net warnings remain
explicit: bottom copper is planned in separate domains rather than ordinary
return-net ratline placement. This is not an isolation/creepage certification.

Grounded real exposed pads U11.17/U12.11/U13.17/U17.17 receive thermal geometry,
with provisional loss budgets documented in the fixture README. U10 HR package
has no exposed-pad pin in the source device; its land copper remains routing work.

Commands from backend root:

```sh
node --import tsx tests/pcb-layout/Portable_AC_DC_Telemetry/Portable_AC_DC_Telemetry.ts --validate
node --import tsx debugging/pcb-layout/Portable_AC_DC_Telemetry-v2/run-mechanical.ts
node --import tsx debugging/pcb-layout/Portable_AC_DC_Telemetry-v2/run-power.ts
node --import tsx tests/pcb-layout/Portable_AC_DC_Telemetry/Portable_AC_DC_Telemetry.ts
npm run typecheck
```

Focused power preview: 27 components, geometry OK, no hard distance violations.
Input-cap soft distances for U13/U17 were 4.74 mm versus a requested 4 mm; R28
away-from-L1 and output-bank row preferences were not fully satisfied. Inspect
these in the full placement before accepting electrical quality. Scoped artifacts
and logs are ignored under debugging/pcb-layout/Portable_AC_DC_Telemetry-v2.
The user subsequently reviewed the full captured placement and requested a
floorplan correction while retaining mechanics.

## Full baseline and floorplan repair

The completed capture `runs/Portable_AC_DC_Telemetry/2026-10-05T10-10-41-924Z`
took 916.54 s (auto_place 913.29 s), with clean geometry and no hard distance
violations. Visual review still found a functional defect: U13/L3 and U17/L4
occupied the upper-right input area alongside the analog filters. U13 center was
(30.464,-32.494), U17 (14.953,-30.895), U1 (16.248,-14.858), U2
(30.551,-14.858), ADC U4 (2.414,4.438). The left side was poorly used.

The repair removes the harvesting-buck-to-J1 attraction and the ADC-to-MCU
attraction. Harvesting converters instead prefer board.top_left; ADC follows the U1/U2 output pads. Two reciprocal functional constraint regions reserve the
upper-right 50 x 47 mm for measurement and the upper-left area for power.
Allowed blocks are explicit, including satellites and the fixed battery port;
mechanical coordinates, outline, nets and local hard switching constraints stay
unchanged. This is a justified rerun after an input change, not solver retuning.

```sh
node --import tsx tests/pcb-layout/Portable_AC_DC_Telemetry/Portable_AC_DC_Telemetry.ts
```

Run log: `debugging/pcb-layout/Portable_AC_DC_Telemetry-v2/floorplan-run.log`.
Full artifacts: `debugging/pcb-layout/Portable_AC_DC_Telemetry`.
DSL validation and TypeScript checks passed. The completed automatic result failed acceptance; subsequent results are recorded below.

The first floorplan run completed with all 154 components, no overlaps/outside
components and no hard switch-distance violations. It moved U13 to
(-40.913,-44.182) and U17 to (-25.453,-39.758), away from the right-side
measurement section. U1/U2 remained at (31.248,-14.358) / (28.466,-28.051).
However the strict geometry runner failed: U6 at (29.857,9.985) intersected the
quiet area by 0.02 mm. The corner attraction also pulled ADC U4 to
(32.062,-41.992), lengthening its analog paths. This result is not accepted.
Saved evidence: floorplan-first.json / floorplan-first-layout.json /
floorplan-first.png in the ignored v2 directory.

The second floorplan input removes the ADC corner attraction, retaining direct
U1/U2 proximity, and adds normal modem attraction to board.bottom_right to leave
space below the quiet boundary. This is a targeted rerun after the two measured
defects, with no mechanical or solver changes. Log: floorplan-final-run.log.

While that second run was pending, detailed readback of the first result exposed
another defect: the U6.60-to-J4.2 RF feed was 27.37 mm, versus the authored soft
8 mm goal. U6 rotated 90 degrees, placing pad 60 on the opposite side from U.FL.
The second run was stopped before completion (no accepted result). The final
input makes that 8 mm relation explicitly hard with preferFacingPads, leaving
modem coordinates movable. Final log: floorplan-rf-run.log. This added bound is
also covered by the fixture's hard-distance assertion.

## Completed RF passes and manually refined reference

The full floorplan-rf-run.log completed but failed: U6 entered the quiet region by 0.02 mm and its RF feed remained 27.37 mm despite the explicit hard 8 mm bound. ADC U4 was now (18.414,-27.562), with U1 (28.252,-11.637) and U2 (31.449,-33.466); the harvesting converters remained left. The DSL subsequently restricted modem rotation to 270, facing J4.

A scoped current-backend run preserved 125 unrelated poses and refined 29 RF components (refine.ts/refine.log). It logged compact_candidates assertions (c.problem.bounds.is_none()), continued with fallback and ended with a hard RF violation: 11.97 mm. C28 entered the quiet region by 2.01 mm. This was not accepted.

Skill-permitted focused geometry correction then changed the modem pose to (26,13,270), moved its supply capacitors clear of the quiet region and coax access, moved SIM support clear of the hinged body, and translated the nine-part modem converter group by (+2,+7) mm with local C33 adjustment. Q1 control support was corrected locally. All other poses were preserved from the scoped result. No native scorer or production solver was modified. The explicit corrections are in ignored v2/repair.ts; its checked result is persisted in tests/pcb-layout/Portable_AC_DC_Telemetry/placement-reference.json with provenance.

Current backend createPlacementReport rebuilt actual geometry and verified: 154 components, all top; report.ok and graphReport.ok true; zero overlaps, outside-board parts, constraint-region violations and hard-distance violations. RF distance is approximately 7.0 mm; ten original mechanical poses passed the fixture assertions. Preview and complete reports: debugging/pcb-layout/Portable_AC_DC_Telemetry-v2/repaired. DSL validation, --validate-reference and npm run typecheck passed.

Revalidate the checked manual reference without claiming solver success:

```sh
node --import tsx tests/pcb-layout/Portable_AC_DC_Telemetry/Portable_AC_DC_Telemetry.ts --validate-reference
```

The ordinary fixture command still runs the current automatic backend and asserts clean geometry and all hard distances. No completed full run is claimed for the final rotation-constrained DSL. The saved reference demonstrates the intended zoning; automatic hard-constraint enforcement and the scoped compact_candidates panic remain backend defects. Geometry acceptance does not establish completed routing or analog/RF performance.

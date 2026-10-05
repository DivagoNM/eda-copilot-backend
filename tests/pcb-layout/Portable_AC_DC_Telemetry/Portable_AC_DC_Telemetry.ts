import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ExplainCircuitStruct } from "../../../src/types/circuit.ts";
import { LayoutRulesSchema } from "../../../src/types/pcb/layout-rules.ts";
import { runPcbLayoutDsl } from "../../../src/pcb-layout/pcb-layout-dsl/spec.ts";
import { validatePlacementRulesForCircuit } from "../../../src/pcb-layout/placement-validation.ts";
import { buildPlacementInput } from "../../../src/pcb-layout/placement-input.ts";
import { createPlacementReport } from "../../../src/pcb-layout/pcb-auto-place/placement-report.ts";
import type { Placement } from "../../../src/types/pcb/layout-model.ts";
import { runPcbLayoutFixture } from "../run-pcb-layout-fixture.ts";

const circuit = ExplainCircuitStruct().parse(JSON.parse(readFileSync(new URL("./Portable_AC_DC_Telemetry.json", import.meta.url), "utf8")));
const rules = LayoutRulesSchema().parse(runPcbLayoutDsl(readFileSync(new URL("./Portable_AC_DC_Telemetry.js", import.meta.url), "utf8")));
validatePlacementRulesForCircuit(circuit, rules);
assert.equal(circuit.components.length, 154);
assert.equal(new Set(circuit.components.map(c => c.designator)).size, circuit.components.length);
assert.ok(circuit.components.every(c => c.part_uuid));
assert.equal(rules.board.type,"polygon");
assert.deepEqual(rules.board.points,[
    {x:-50,y:-50},{x:-50,y:50},{x:-36,y:50},{x:-36,y:43},
    {x:14,y:43},{x:14,y:50},{x:50,y:50},{x:50,y:-50},
]);
const mechanics=["J1","J2","J3","J4","J5","J6","J7","SW1","SW2","U5"];
for(const ref of mechanics) {
    const r=rules.component_rules.find(r=>r.designator===ref);
    assert.ok(r?.fixedPlacement || (r?.edgeMount && r.edgeMount.slide!==true),ref+" must have locked mechanics");
}
assert.ok(rules.blocks.every(b=>b.component_designators.length<12));
for(const name of ["quiet_measurement_area","power_area"])
    assert.ok(rules.constraintRegions.some(r=>r.name===name),name+" floorplan missing");
// These source symbols omit footprint metadata; resolve their device UUIDs at run time.
assert.deepEqual(circuit.components.filter(c => !c.footprint_name).map(c => c.designator).sort(), ["J4", "U14", "U18", "U5"]);
const owned = rules.blocks.flatMap(b => b.component_designators);
assert.equal(owned.length, circuit.components.length);
assert.deepEqual([...owned].sort(), circuit.components.map(c => c.designator).sort());
const netAt = (target: { designator: string; pin_number: string | number }) => {
    const c = circuit.components.find(c => c.designator === target.designator);
    const p = c?.pins.find(p => String(p.pin_number) === String(target.pin_number));
    assert.ok(p?.signal_name, "Missing connected pin: " + target.designator + "." + target.pin_number);
    return p.signal_name;
};
for (const h of rules.hints) if (h.relation === "critical_pair") assert.equal(netAt(h.source), netAt(h.target));
for (const p of rules.paths) for (const s of p.segments) assert.equal(netAt(s.source), netAt(s.target));
if (process.argv.includes("--validate")) {
    console.log("DSL valid: " + circuit.components.length + " components, " + rules.blocks.length + " blocks, " + rules.paths.length + " paths.");
} else {
    const run = process.argv.includes("--validate-reference")
        ? await (async () => {
            const placements: Placement[] = JSON.parse(readFileSync(new URL("./placement-reference.json", import.meta.url), "utf8")).placements;
            const input = await buildPlacementInput(circuit, rules);
            return { placements, placementReport: createPlacementReport(input, placements) };
        })()
        : await runPcbLayoutFixture(import.meta.url, "Portable_AC_DC_Telemetry");
    assert.equal(run.placements.length, circuit.components.length);
    assert.equal(new Set(run.placements.map(p => p.designator)).size, circuit.components.length);
    assert.equal(run.placementReport.ok,true,"Placement geometry must pass");
    assert.equal(run.placementReport.graphReport.ok,true);
    assert.ok(run.placements.every(p=>p.layer==="top"));
    const expected=[
        ["J1",46.1496,-17.5,90],["J2",46.1496,-32,90],
        ["J5",-45.4525,16,270],["J6",13.5,-46.1496,0],
        ["J7",-44,-3,90],["J3",26,36,0],["J4",46,14,270],
        ["SW1",-29,35,0],["SW2",5,35,0],["U5",-11,36.25,0],
    ] as const;
    for(const [ref,x,y,rotate] of expected) {
        const p=run.placements.find(p=>p.designator===ref);
        assert.ok(p,ref);
        assert.ok(Math.abs(p.x-x)<0.005 && Math.abs(p.y-y)<0.005,ref+" mechanics moved");
        assert.equal(p.rotate,rotate,ref+" orientation moved");
    }
    assert.deepEqual(run.placementReport.hintViolations.filter(v=>v.hint.relation==="critical_pair"&&v.hint.hard===true),[],"Switch loops and RF feed must satisfy hard distances");
    assert.ok(!run.placementReport.graphReport.diagnostics.some(d=>d.code==="unattached_passive_block"));
    console.log(process.argv.includes("--validate-reference") ? "Manually refined reference valid: 154 components, clean geometry, preserved mechanics and hard distances." : "Automatic placement passed.");
}

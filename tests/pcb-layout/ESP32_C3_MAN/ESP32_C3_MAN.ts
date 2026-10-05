import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ExplainCircuitStruct } from "../../../src/types/circuit.ts";
import { LayoutRulesSchema } from "../../../src/types/pcb/layout-rules.ts";
import { runPcbLayoutDsl } from "../../../src/pcb-layout/pcb-layout-dsl/spec.ts";
import { validatePlacementRulesForCircuit } from "../../../src/pcb-layout/placement-validation.ts";
import { runPcbLayoutFixture } from "../run-pcb-layout-fixture.ts";
import { instrumentLocalLayoutDsl, extractLocalLayouts, stripLocalLayoutCarriers, validateLocalLayouts } from "../../../src/pcb-layout/pcb-auto-place-v2/local-layout.ts";

const circuit = ExplainCircuitStruct().parse(JSON.parse(readFileSync(new URL("./ESP32_C3_MAN.json", import.meta.url), "utf8")));
const rawRules = runPcbLayoutDsl(instrumentLocalLayoutDsl(readFileSync(new URL("./ESP32_C3_MAN.js", import.meta.url), "utf8")));
const localLayouts = extractLocalLayouts(rawRules);
const rules = LayoutRulesSchema().parse(stripLocalLayoutCarriers(rawRules));
validatePlacementRulesForCircuit(circuit, rules);
validateLocalLayouts(circuit, rules, localLayouts);
assert.equal(rules.board.width, 120);
assert.equal(rules.board.height, 85);
assert.equal(rules.boardHoles.length, 4);
const mechanics = ["J1","J2","J3","J4","J5","J6","J7","J8","J9","SW1","SW2","LED1","U3"];
for (const ref of mechanics) {
    const rule = rules.component_rules.find(r => r.designator === ref);
    assert.ok(rule?.fixedPlacement || (rule?.edgeMount && rule.edgeMount.slide !== true), ref + " must have locked mechanics");
}
assert.equal(circuit.components.length, 107);
assert.equal(new Set(circuit.components.map(c => c.designator)).size, circuit.components.length);
assert.ok(circuit.components.every(c => c.part_uuid && c.footprint_name));
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
    const run = await runPcbLayoutFixture(import.meta.url, "ESP32_C3_MAN");
    assert.equal(run.placements.length, circuit.components.length);
    assert.equal(new Set(run.placements.map(p => p.designator)).size, circuit.components.length);
    assert.equal(run.placementReport.ok, true, "Geometry, layers and mounting holes must pass");
    assert.equal(run.placementReport.graphReport.ok, true);
    assert.ok(run.placements.every(p => p.layer === "top"));
    assert.equal(run.layout.board.outline.width, 120);
    assert.equal(run.layout.board.outline.height, 85);
    const expected = [
        ["J1",-55.8,12,90],["J2",-42,38.9027,180],["J3",-56.5,-18,90],
        ["J4",-27,-38.3,0],["J5",20,-38.223,0],["J6",54,12,90],
        ["J7",40,12,270],["J8",54,-19,90],["J9",40,-19,270],
        ["SW1",20,34,0],["SW2",34,34,0],["LED1",44,34,0],["U3",-6,38.5,0],
    ] as const;
    for (const [ref,x,y,rotate] of expected) {
        const pose = run.placements.find(p => p.designator === ref);
        assert.ok(pose, ref);
        assert.ok(Math.abs(pose.x-x) < 0.005 && Math.abs(pose.y-y) < 0.005, ref + " mechanical coordinates moved");
        assert.equal(pose.rotate, rotate, ref + " mechanical orientation moved");
    }
    assert.deepEqual(run.placementReport.hintViolations.filter(v => v.hint.relation === "critical_pair" && v.hint.hard === true), [], "Switch node and connector TVS devices must satisfy hard distances");
    assert.ok(!run.placementReport.graphReport.diagnostics.some(d => d.code === "unattached_passive_block"));
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ExplainCircuitStruct } from "../../../src/types/circuit.ts";
import { LayoutRulesSchema } from "../../../src/types/pcb/layout-rules.ts";
import { runPcbLayoutDsl } from "../../../src/pcb-layout/pcb-layout-dsl/spec.ts";
import { validatePlacementRulesForCircuit } from "../../../src/pcb-layout/placement-validation.ts";
import { runPcbLayoutFixture } from "../run-pcb-layout-fixture.ts";

const circuit = ExplainCircuitStruct().parse(JSON.parse(readFileSync(new URL("./STM32G0_CAN_RS485.json", import.meta.url), "utf8")));
const code = readFileSync(new URL("./STM32G0_CAN_RS485.js", import.meta.url), "utf8");
const rules = LayoutRulesSchema().parse(runPcbLayoutDsl(code));
validatePlacementRulesForCircuit(circuit, rules);
assert.equal(circuit.components.length, 68);
assert.equal(new Set(circuit.components.map(component => component.designator)).size, 68);
assert.ok(circuit.components.every(component => component.part_uuid && component.footprint_name));

// Verify explicit electrical pin pairs against the live-exported netlist, including
// pairs that the generic placement validator does not check for net membership.
const netAt = (target: { designator: string; pin_number: string | number }) => {
    const component = circuit.components.find(component => component.designator === target.designator);
    const pin = component?.pins.find(pin => String(pin.pin_number) === String(target.pin_number));
    assert.ok(pin, `Missing pin ${target.designator}.${target.pin_number}`);
    assert.ok(pin.signal_name, `Unconnected pin ${target.designator}.${target.pin_number}`);
    return pin.signal_name;
};
for (const hint of rules.hints) {
    if (hint.relation === "critical_pair") assert.equal(netAt(hint.source), netAt(hint.target),
        `Electrical pair ${hint.source.designator}.${hint.source.pin_number} -> ${hint.target.designator}.${hint.target.pin_number} must share a net`);
}
for (const path of rules.paths) for (const segment of path.segments) {
    assert.equal(netAt(segment.source), netAt(segment.target));
}

if (process.argv.includes("--validate")) {
    console.log(`DSL valid: ${circuit.components.length} components, ${rules.blocks.length} blocks, ${rules.paths.length} signal paths, 60 x 40 mm.`);
} else {
    const run = await runPcbLayoutFixture(import.meta.url, "STM32G0_CAN_RS485");
    assert.equal(run.placements.length, 68, "All schematic components must be placed");
    assert.equal(new Set(run.placements.map(placement => placement.designator)).size, 68);
    assert.equal(run.layout.board.outline.width, 60);
    assert.equal(run.layout.board.outline.height, 40);
    assert.ok(run.placements.every(placement => placement.layer === "top"));
    assert.equal(run.placementReport.ok, true, "Placement must pass body clearance, board edge and layer checks");
    assert.equal(run.placementReport.graphReport.ok, true, "Placement ownership graph must be valid");
    assert.ok(!run.placementReport.graphReport.diagnostics.some(diagnostic => diagnostic.code === "unattached_passive_block"),
        "Passive groups must have an explicit physical attachment");
    const hardViolations = run.placementReport.hintViolations.filter(violation =>
        violation.hint.relation === "critical_pair" && violation.hint.hard === true);
    assert.deepEqual(hardViolations, [], "The buck switch-node distance must satisfy its hard limit");
}

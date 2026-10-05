import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ExplainCircuitStruct} from "../../../src/types/circuit.ts";
import {LayoutRulesSchema} from "../../../src/types/pcb/layout-rules.ts";
import {runPcbLayoutDsl} from "../../../src/pcb-layout/pcb-layout-dsl/spec.ts";
import {validatePlacementRulesForCircuit} from "../../../src/pcb-layout/placement-validation.ts";
import {componentBodyBox,componentPadBox,isThroughHolePad,boxGap,boxInsideBoard} from "../../../src/pcb-layout/pcb-auto-place/geometry.ts";
import {buildPlacementInput} from "../../../src/pcb-layout/placement-input.ts";
import {createPlacementReport} from "../../../src/pcb-layout/pcb-auto-place/placement-report.ts";
import type {Placement} from "../../../src/types/pcb/layout-model.ts";
import {runPcbLayoutFixture} from "../run-pcb-layout-fixture.ts";
const read=(f:string)=>readFileSync(new URL(f,import.meta.url),"utf8");
const outputName="STEPPER_CONTROLLER-v3/automatic";
const circuit=ExplainCircuitStruct().parse(JSON.parse(read("./STEPPER_CONTROLLER.json")));
const rules=LayoutRulesSchema().parse(runPcbLayoutDsl(read("./STEPPER_CONTROLLER.js")));
validatePlacementRulesForCircuit(circuit,rules);
assert.equal(circuit.components.length,85);
assert.deepEqual(rules.blocks.flatMap(b=>b.component_designators).sort(),circuit.components.map(c=>c.designator).sort());
assert.ok(rules.blocks.every(b=>b.component_designators.length<12));
assert.equal(rules.board.type,"polygon");
assert.equal(Math.max(...rules.board.points.map(p=>p.x))-Math.min(...rules.board.points.map(p=>p.x)),45);
assert.equal(Math.max(...rules.board.points.map(p=>p.y))-Math.min(...rules.board.points.map(p=>p.y)),66);
for(const [x,y] of [[7.7,33],[7.7,27.5],[-7.7,27.5],[-7.7,33]])assert.ok(rules.board.points.some(p=>p.x===x&&p.y===y),"Antenna notch missing");
const mount=[["SCREW1",-15.5,-3.7],["SCREW2",15.5,-3.7],["SCREW3",-15.5,27.3],["SCREW4",15.5,27.3]] as const;
for(const [ref,x,y] of mount){const r=rules.component_rules.find(c=>c.designator===ref);assert.equal(r?.fixedPlacement?.x,x);assert.equal(r?.fixedPlacement?.y,y);}
const face=rules.constraintRegions.find(r=>r.name==="NEMA17_top_face");
assert.ok(face);assert.deepEqual(face.layers,["top"]);assert.equal(face.shape.width,42.3);assert.equal(face.shape.height,42.3);
assert.deepEqual(face.allow?.blocks,["motor_mount","usb_data","usb_pd_port","usb_uart_port"]);
for(const ref of ["USB1","USB2","USB3"])assert.deepEqual(rules.component_rules.find(c=>c.designator===ref)?.allowedLayers,["bottom"]);
for(const [ref,edge,y] of [["USB1","left",6],["USB2","left",-23],["USB3","right",6]] as const){
 const intent=rules.component_rules.find(c=>c.designator===ref)?.edgeMount;
 assert.equal(intent?.edge,edge);assert.equal(intent?.y,y);
}
for(const [ref] of mount)assert.deepEqual(rules.constraintRegions.find(r=>r.name===ref+"_tool_access")?.layers,["top","bottom"]);
const netAt=(t:{designator:string;pin_number:string|number})=>circuit.components.find(c=>c.designator===t.designator)?.pins.find(p=>String(p.pin_number)===String(t.pin_number))?.signal_name;
for(const p of rules.paths)for(const s of p.segments){assert.ok(netAt(s.source));assert.equal(netAt(s.source),netAt(s.target));}
for(const h of rules.hints)if(h.relation==="critical_pair"){assert.ok(netAt(h.source));assert.equal(netAt(h.source),netAt(h.target));}
if(process.argv.includes("--validate"))console.log(`DSL valid: 85 components, ${rules.blocks.length} blocks, ${rules.paths.length} paths.`);
else {
 const run=(process.argv.includes("--verify-output") || process.argv.includes("--verify-reference"))
  ? await (async()=>{
    const placements:Placement[]=JSON.parse(process.argv.includes("--verify-reference") ? read("./placement-reference.json") : readFileSync(`debugging/pcb-layout/${outputName}/placement.json`,"utf8")).placements;
    const placementInput=await buildPlacementInput(circuit,rules);
    return {placements,placementInput,placementReport:createPlacementReport(placementInput,placements)};
   })()
  : await runPcbLayoutFixture(import.meta.url,"STEPPER_CONTROLLER",outputName);
 assert.equal(run.placements.length,85);assert.equal(new Set(run.placements.map(p=>p.designator)).size,85);
 assert.equal(run.placementReport.ok,true,"Geometry must pass");assert.equal(run.placementReport.graphReport.ok,true);
 assert.deepEqual(run.placementReport.hintViolations.filter(v=>v.hint.hard),[],"Hard electrical distances must pass");
 for(const [ref,x,y] of [...mount,["U1",0,11.8] as const,["DD1",-4.563,-23] as const,["U7",14,-28.952] as const]){
  const p=run.placements.find(p=>p.designator===ref);assert.ok(p);assert.ok(Math.abs(p.x-x)<0.005&&Math.abs(p.y-y)<0.005,ref+" mechanical datum moved");
  assert.equal(p.layer,ref==="U1"?"bottom":"top");
 }
 const espPose=run.placements.find(p=>p.designator==="U4")!;
 assert.equal(espPose.layer,"bottom");assert.equal(espPose.rotate,0);assert.ok(Math.abs(espPose.y-24.25)<0.005&&Math.abs(espPose.x)<0.005);
 const esp=run.placementInput.components.find(c=>c.designator==="U4")!;
 for(const [ref,y,rotation] of [["USB1",6,270],["USB2",-23,270],["USB3",6,90]] as const){
  const p=run.placements.find(p=>p.designator===ref)!;
  assert.equal(p.layer,"bottom");assert.equal(p.rotate,rotation);assert.ok(Math.abs(p.y-y)<0.005,ref+" moved from approved edge");
  const c=run.placementInput.components.find(c=>c.designator===ref)!;
  for(const pad of c.footprint.pads)assert.ok(boxInsideBoard(run.placementInput.board,componentPadBox(p,pad),0),ref+" retention/electrical pad unsupported");
 }
 const espBody=componentBodyBox(esp,espPose);
 assert.ok(espBody.left>=-22.5&&espBody.right<=22.5&&espBody.top>=-33&&espBody.bottom<=33,"ESP must stay inside the outer board envelope");
 for(const pad of esp.footprint.pads)assert.ok(boxInsideBoard(run.placementInput.board,componentPadBox(espPose,pad),0.59),"ESP solder pad unsupported at notch");
 const motorFace={left:-21.15,right:21.15,top:-9.35,bottom:32.95};
 for(const c of run.placementInput.components){
  if(c.designator.startsWith("SCREW"))continue;
  const p=run.placements.find(p=>p.designator===c.designator)!;
  for(const [ref,x,y] of mount){
   const access={left:x-4,right:x+4,top:y-4,bottom:y+4};
   assert.ok(boxGap(componentBodyBox(c,p),access)>=0.34,c.designator+" blocks screw access at "+ref);
   for(const pad of c.footprint.pads.filter(isThroughHolePad))assert.ok(boxGap(componentPadBox(p,pad),access)>=0.34,c.designator+" through-hole blocks screw access at "+ref);
  }
  if(p.layer==="top")assert.ok(boxGap(componentBodyBox(c,p),motorFace)>=0.34,c.designator+" intrudes into motor face");
  // USB retention tabs are flush on TOP per the user's assembly specification.
  // Keep their actual pads in native collision checks and screw-access checks.
  if(!["USB1","USB2","USB3"].includes(c.designator))for(const pad of c.footprint.pads.filter(isThroughHolePad))assert.ok(boxGap(componentPadBox(p,pad),motorFace)>=0.34,c.designator+"."+pad.pin_number+" protrudes under motor");
 }
 assert.ok(!run.placementReport.graphReport.diagnostics.some(d=>d.code==="unattached_passive_block"));
 console.log("Placement passed: free motor face, screw access, centered AS5600, clean geometry and hard loops.");
}

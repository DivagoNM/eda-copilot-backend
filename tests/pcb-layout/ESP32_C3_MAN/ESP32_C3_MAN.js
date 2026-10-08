// ESP32_C3_MAN: intentional full re-placement of Board1 / PCB1.
// Mechanics define a 120 x 85 mm enclosure-facing board, origin at its center.
// Two-layer plan: components/signals on top, mostly continuous bottom reference
// copper, separate field/bus returns, plated through vias. No routing is applied.
board.roundedRect(120, 85, { radius: 2, layers: ["top", "bottom"], defaultLayer: "top", clearance: 0.35, edge: 0.5 });
boardHole.corners({ inset: 6, drill: 3.2, diameter: 3.2, keepout: 3.2, prefix: "MH" });

// Port TVS devices belong to their connector's local block; only mechanics are locked.
for (const ref of ["J1","J2","J3","J4","J5","J6","J7","J8","J9","SW1","SW2","LED1"])
  block("mechanical_" + ref, ref === "J6" ? [ref,"U14"] : ref === "J8" ? [ref,"U17"] : [ref], "connector");
block("mcu", ["U3"], "mcu");
component("J1").role("connector").top().edgeMount("left", { y: 12, overhang: 0, face: "outward" });
component("J2").role("connector").top().edgeMount("bottom", { x: -42, overhang: 0.5, face: "outward" });
component("J3").role("connector").top().fixed({ x: -56.5, y: -18, rotate: 90, layer: "top" });
component("J4").role("connector").top().edgeMount("top", { x: -27, overhang: 0, face: "outward" });
component("J5").role("connector").top().edgeMount("top", { x: 20, overhang: 0, face: "outward" });
component("J8").role("connector").top().edgeMount("right", { y: -19, overhang: 0, face: "outward" });
component("J6").role("connector").top().edgeMount("right", { y: 12, overhang: 0, face: "outward" });
// Right-angle termination headers face inward, with free shunt insertion space.
component("J9").role("connector").top().fixed({ x: 40, y: -19, rotate: 270, layer: "top" });
component("J7").role("connector").top().fixed({ x: 40, y: 12, rotate: 270, layer: "top" });
for (const [name,y] of [["can_shunt_access",-19],["rs485_shunt_access",12]])
  constraintRegion(name, { shape:region.rect({anchor:anchor("board.center"),width:8,height:6,offset:{x:29,y}}),layers:["top"] });
component("SW1").role("connector").top().fixed({ x: 20, y: 34, rotate: 0, layer: "top" });
component("SW2").role("connector").top().fixed({ x: 34, y: 34, rotate: 0, layer: "top" });
component("LED1").role("indicator").top().fixed({ x: 44, y: 34, rotate: 0, layer: "top" });
// Verified footprint: all castellated pads end at local y=3.4; antenna occupies
// the unpadded lower tail. 6 mm overhang leaves pads 0.6 mm inside the board.
component("U3").role("main_ic").top().rotations(0).edgeMount("bottom", { x: -6, overhang: 6, face: "any" });
constraintRegion("antenna_tail", {
  shape: region.rect({ anchor: anchor("board.bottom"), width: 24, height: 3, offset: { x: -6 } }),
  layers: ["top","bottom"], allow: { blocks: ["mcu"] },
});
// This excludes components only; antenna copper exclusion belongs to later routing.

block("mcu_supply", ["C11","C12"], "mcu", { placement: "satellite", attachTo: "mcu", anchor: pin("U3","1") });
block("reset_support", ["R7","C13"], "mcu", { placement: "satellite", attachTo: "mcu", anchor: pin("U3","2") });
block("boot_support", ["R8"], "mcu", { placement: "satellite", attachTo: "mcu", anchor: pin("U3","8") });
block("status_resistor", ["R13"], "generic");
near(comp("R13"), pin("LED1","2"), "high");
near(comp("R7"), comp("SW1"), "normal");
near(comp("R8"), comp("SW2"), "normal");

block("usb_protection", ["U4","R10"], "generic", { allowDisconnected: true });
block("usb_cc1", ["R9"], "generic");
block("usb_fuse", ["F2"], "power");
block("usb_series", ["R11","R12"], "mcu", { placement: "satellite", attachTo: "mcu", anchor: pin("U3","13"), allowDisconnected: true });
near(comp("U4"), comp("J2"), "critical");
near(comp("R9"), pin("J2","A5"), "high");
near(comp("R10"), pin("J2","B5"), "high");
near(comp("F2"), comp("J2"), "high");
// Original netlist contains USB-to-GND assignments; retain them rather than
// fabricating connections. These valid paths cover only U4 -> series -> MCU.
signalPath("usb_dp", [[pin("U4","6"),pin("R11","1")],[pin("R11","2"),pin("U3","14")]], { priority:"critical" });
signalPath("usb_dm", [[pin("U4","4"),pin("R12","1")],[pin("R12","2"),pin("U3","13")]], { priority:"critical" });

block("i2c_protection", ["U5"], "generic");
block("i2c_series", ["R14","R15","R16","R17"], "mcu", { placement:"satellite", attachTo:"mcu", anchor:pin("U3","18") });
near(comp("U5"), comp("J3"), "high");
signalPath("i2c_sda", [[pin("U3","18"),pin("R14","2")],[pin("R14","1"),pin("U5","6")],[pin("U5","1"),pin("J3","3")]], {priority:"normal"});
signalPath("i2c_scl", [[pin("U3","17"),pin("R15","2")],[pin("R15","1"),pin("U5","4")],[pin("U5","3"),pin("J3","4")]], {priority:"normal"});
capCluster(["C11","C12"], { powerNet:"3V3", returnNet:"GND", target:pin("U3","1"), maxRows:1, gap:0.4, priority:"high" });
criticalPair(pin("R7","2"),pin("U3","2"),{maxDistance:4,hard:false});
criticalPair(pin("C13","1"),pin("U3","2"),{maxDistance:4,hard:false});
criticalPair(pin("R8","2"),pin("U3","8"),{maxDistance:4,hard:false});

block("input_protection", ["F1","D1","D2"], "power");
block("buck", ["U1","L1","D3","C3"], "power");
block("buck_input", ["C1","C2","R1","R2"], "power", { placement:"satellite",attachTo:"buck",anchor:pin("U1","2") });
block("buck_frequency", ["R3"], "power", { placement:"satellite",attachTo:"buck",anchor:pin("U1","4") });
block("buck_output", ["C4","C5"], "power", { placement:"satellite",attachTo:"buck",anchor:pin("L1","2") });
block("buck_feedback", ["R4","R5"], "power", { placement:"satellite",attachTo:"buck",anchor:pin("U1","5") });
block("buck_compensation", ["R6","C6","C7"], "power", { placement:"satellite",attachTo:"buck",anchor:pin("U1","6") });
block("power_oring", ["D4","D5","C8"], "power");
block("ldo", ["U2","C9","C10"], "power");
near(comp("F1"), pin("J1","1"), "high");
near(comp("D2"), comp("J1"), "high");
near(comp("U1"), comp("J1"), "high");
near(comp("D4"), pin("L1","2"), "high");
near(comp("D5"), comp("F2"), "normal");
near(comp("U2"), pin("U3","1"), "high");
away(comp("L1"), comp("U3"), "high");
// Hard dominant SW/inductor pair; other short loops remain physically flexible.
coreIsland("buck_switch", ["U1","L1"], { pairs:[[pin("U1","8"),pin("L1","1")]],maxDistance:5,hard:true,preferFacingPads:true });
criticalPair(pin("U1","8"),pin("D3","1"),{maxDistance:5,priority:"high",hard:false,preferFacingPads:true});
criticalPair(pin("U1","1"),pin("C3","1"),{maxDistance:3,hard:false});
criticalPair(pin("U1","8"),pin("C3","2"),{maxDistance:3,hard:false});
criticalPair(pin("U1","7"),pin("D3","2"),{maxDistance:6,hard:false});
capCluster(["C1","C2"],{powerNet:"VIN_PROT",returnNet:"GND",target:pin("U1","2"),maxRows:1,gap:0.4,priority:"high"});
capCluster(["C4","C5"],{powerNet:"BUCK_5V",returnNet:"GND",target:pin("L1","2"),maxRows:1,gap:0.4,priority:"high"});
criticalPair(pin("R3","1"),pin("U1","4"),{maxDistance:3,hard:false});
criticalPair(pin("R5","1"),pin("U1","5"),{maxDistance:3,hard:false});
criticalPair(pin("R6","1"),pin("U1","6"),{maxDistance:3,hard:false});
away(block("buck_feedback"), comp("L1"), "high");
bypass(["C9"],pin("U2","1"),"high");
bypass(["C10"],pin("U2","5"),"high");
// TPS54360 DDA: pin 9 is the grounded PowerPAD, thetaJCbot=3.6 C/W.
// Provisional 1 W dissipation / 35 C rise budget; reserve bottom copper in routing.
primitive.thermalPad("buck_powerpad", { at:pin("U1","9"),power:{dissipation:1,maxTemperatureRise:35},thetaJC:3.6,limits:{maxSize:{width:16,height:16}} });

block("can", ["U15","C19","C20"], "generic");
block("can_supply", ["U16","C21","C22"], "power");
block("can_termination", ["R35"], "generic");
near(comp("U15"), comp("J8"), "high");
near(comp("U16"), pin("U15","8"), "high");
near(comp("U17"), comp("J8"), "critical");
near(comp("R35"), comp("J9"), "high");
bypass(["C19"],pin("U15","1"),"high"); bypass(["C20"],pin("U15","8"),"high");
bypass(["C21"],pin("U16","2"),"high"); bypass(["C22"],pin("U16","4"),"high");
criticalPair(pin("U15","7"),pin("J8","1"),{maxDistance:18,priority:"high",hard:false});
criticalPair(pin("U15","6"),pin("J8","2"),{maxDistance:18,priority:"high",hard:false});
criticalPair(pin("U17","1"),pin("J8","1"),{maxDistance:5,priority:"critical",hard:true});
criticalPair(pin("U17","3"),pin("J8","2"),{maxDistance:7,priority:"high",hard:false});

block("rs485", ["U12","C15","C16"], "generic");
block("rs485_supply", ["U13","C17","C18"], "power");
block("rs485_termination", ["R34"], "generic");
near(comp("U12"), comp("J6"), "high");
near(comp("U13"), pin("U12","16"), "high");
near(comp("U14"), comp("J6"), "critical");
near(comp("R34"), comp("J7"), "high");
bypass(["C15"],pin("U12","1"),"high"); bypass(["C16"],pin("U12","16"),"high");
bypass(["C17"],pin("U13","2"),"high"); bypass(["C18"],pin("U13","4"),"high");
criticalPair(pin("U12","12"),pin("J6","1"),{maxDistance:18,priority:"high",hard:false});
criticalPair(pin("U12","13"),pin("J6","2"),{maxDistance:18,priority:"high",hard:false});
criticalPair(pin("U14","1"),pin("J6","1"),{maxDistance:5,priority:"critical",hard:true});
criticalPair(pin("U14","2"),pin("J6","2"),{maxDistance:7,priority:"high",hard:false});

block("io_expander", ["U6","C14"], "mcu");
near(comp("U6"), anchor("board.center"), "normal");
bypass(["C14"],pin("U6","24"),"high");
for(let i=0;i<4;i++) {
  const opto="U"+(7+i), first="R"+(18+2*i), second="R"+(19+2*i), clamp="D"+(6+i), tvs="D"+(10+i), pullup="R"+(26+i);
  block("digital_input_"+(i+1),[opto,first,second,clamp,tvs,pullup],"generic");
  signalPath("di_"+(i+1),[[pin("J4",String(i+1)),pin(first,"1")],
    [pin(first,"2"),pin(second,"1")],[pin(second,"2"),pin(opto,"1")]],{priority:"high"});
  criticalPair(pin(tvs,"1"),pin("J4",String(i+1)),{maxDistance:6,priority:"high",hard:false});
  criticalPair(pin(clamp,"1"),pin(opto,"1"),{maxDistance:4,hard:false});
  criticalPair(pin(pullup,"2"),pin(opto,"4"),{maxDistance:4,hard:false});
  near(pin(opto,"4"),pin("U6",String(4+i)),"normal");
}
block("output_driver", ["U11"], "generic");
block("output_pulldowns", ["R30","R31","R32","R33"], "generic",{placement:"satellite",attachTo:"output_driver",anchor:pin("U11","1"),allowDisconnected:true});
block("output_tvs", ["D14"], "power");
// near(comp("U11"), comp("J5"), "high");
near(comp("D14"), pin("J5","5"), "high");
for(let i=0;i<4;i++) {
  const fuse="F"+(3+i);
  block("output_fuse_"+(i+1),[fuse],"power");
  signalPath("do_"+(i+1),[[pin("U11",String(16-i)),pin(fuse,"1")],[pin(fuse,"2"),pin("J5",String(i+1))]],{priority:"high"});
}
// Bus protection and isolated supplies remain independent physical islands:
// grouping them into a rigid envelope obstructs the termination access zones.
module("power_electronics",["input_protection","buck","power_oring"]);
for(const ref of ["U1","U2","U4","U5","U6","U7","U8","U9","U10","U11","U12","U13","U14","U15","U16","U17"]) component(ref).role("main_ic").top();
// D1/D3/D4/D5 use external copper spreading, U2/U11 use lead copper;
// U12/U15/module supplies need ground copper, no synthetic thermal pad.
// Remaining low-power signal/ESD parts need no extra thermal geometry.
silkscreen.designators({height:1,rotations:[0,90],margin:0.25});
solver({grid:0.5,ignoredSignals:["GND"],compactness:"normal"});

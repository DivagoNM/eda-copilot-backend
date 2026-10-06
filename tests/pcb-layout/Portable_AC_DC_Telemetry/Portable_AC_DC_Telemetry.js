// Live EasyEDA Portable AC DC Voltage Current Telemetry / Board1 / PCB1.
// Native polygon in mil converted to mm; source notch retained.
// Intentional full re-placement, keeping the source outline and interface edges.
// Two-layer plan: top components/critical signals and copper current loops;
// bottom reference copper split by the isolated input domains. No routing applied.
board.polygon([
  { x: -50, y: -50 }, { x: -50, y: 50 }, { x: -36, y: 50 },
  { x: -36, y: 43 }, { x: 14, y: 43 }, { x: 14, y: 50 },
  { x: 50, y: 50 }, { x: 50, y: -50 }
], { layers: ["top", "bottom"], defaultLayer: "top", clearance: 0.35, edge: 0.5 });
solver({ grid: 0.5, ignoredSignals: ["GND", "V_MEAS_N", "I_OUT", "HARVEST_P"], compactness: "normal" });
silkscreen.designators({ height: 1, rotations: [0, 90], margin: 0.25 });

// Source-facing mechanics: measurement on right, USB left, battery above.
block("voltage_port", ["J1"], "connector");
block("harvest_fuse", ["F2"], "power");
near(comp("F2"),pin("J1","1"),"high");
block("voltage_divider", ["R1","R2","R3","R4","R5","C1"], "analog", { placement:"satellite",attachTo:"voltage_isolation",anchor:pin("U1","6") });
block("voltage_isolation", ["U1","C2","C3","C4","C5","C6","C7","C8"], "analog");
block("current_port", ["J2","R6"], "connector");
block("current_filter", ["R7","R8","C9"], "analog", { placement:"satellite",attachTo:"current_isolation",anchor:pin("U2","6") });
block("current_isolation", ["U2","C10","C11","C12","C13","C14","C15","C16"], "analog");
block("afe_supply", ["U3","R9","C17"], "power");
block("adc", ["U4","C20","C21","C22","C23","R16","R17"], "analog");
block("adc_voltage_input", ["R10","R11","R12","R13","C18"], "analog", { placement: "satellite", attachTo: "adc", anchor: pin("U4","3") });
block("adc_current_input", ["R14","R15","C19"], "analog", { placement: "satellite", attachTo: "adc", anchor: pin("U4","6") });
near(block("voltage_divider"), comp("J1"), "high");
near(block("current_filter"), comp("R6"), "high");
// near(comp("U1"),comp("J1"),"high");
near(comp("U2"),comp("J2"),"high");
near(comp("U4"),comp("U1"),"high");
near(comp("U4"),comp("U2"),"high");
// U1/U2 attractions locate the ADC between their outputs; a corner anchor
// would lengthen the differential analog paths unnecessarily.
near(block("afe_supply"), block("adc"), "normal");
signalPath("voltage_divider_chain",[[pin("J1","1"),pin("R1","1")],
  [pin("R1","2"),pin("R2","1")],[pin("R2","2"),pin("R3","1")],
  [pin("R3","2"),pin("R4","1")],[pin("R4","2"),pin("U1","6")]],{priority:"high"});
for(const [name,shunt,filter,input] of [["p","1","R7","6"],["n","2","R8","7"]])
  signalPath("shunt_kelvin_"+name,[[pin("R6",shunt),pin(filter,"1")],[pin(filter,"2"),pin("U2",input)]],{priority:"critical"});
criticalPair(pin("J2","1"),pin("R6","1"),{maxDistance:5,priority:"high",hard:false});
criticalPair(pin("J2","2"),pin("R6","2"),{maxDistance:5,priority:"high",hard:false});
for (const [cap, ic, number] of [
  ["C2","U1","12"],["C4","U1","16"],["C5","U1","1"],["C7","U1","5"],
  ["C10","U2","12"],["C12","U2","16"],["C13","U2","1"],["C15","U2","5"],
  ["C20","U4","1"],["C22","U4","20"],["C23","U4","18"]
]) bypass([cap], pin(ic,number), "high");
for(const [caps,net,ret,ic,pad] of [
  [["C2","C3"],"AFE_3V3","GND","U1","12"],
  [["C5","C6"],"U1_HDC","V_MEAS_N","U1","1"],
  [["C7","C8"],"U1_HLDO","V_MEAS_N","U1","5"],
  [["C10","C11"],"AFE_3V3","GND","U2","12"],
  [["C13","C14"],"U2_HDC","I_OUT","U2","1"],
  [["C15","C16"],"U2_HLDO","I_OUT","U2","5"]
]) capCluster(caps,{powerNet:net,returnNet:ret,target:pin(ic,pad),maxRows:1,gap:0.4,priority:"high"});
for (const [name, ic, out, resistor, adcPin] of [
  ["voltage_p","U1","11","R10","3"],["voltage_n","U1","10","R12","4"],
  ["current_p","U2","11","R14","6"],["current_n","U2","10","R15","5"]
]) signalPath(name, [[pin(ic,out),pin(resistor,"1")],[pin(resistor,"2"),pin("U4",adcPin)]], { priority: "high" });

block("mcu", ["U5"], "mcu");
block("mcu_supply",["C24","C25"],"mcu",{placement:"satellite",attachTo:"mcu",anchor:pin("U5","2")});
block("reset_button",["SW1"],"connector");
block("boot_button",["SW2"],"connector");
block("mcu_reset", ["R18","C26"], "mcu", { placement:"satellite",attachTo:"mcu",anchor:pin("U5","3") });
block("mcu_boot", ["R19"], "mcu", { placement:"satellite",attachTo:"mcu",anchor:pin("U5","27") });
block("battery_sense", ["R20","R21","C27"], "analog", { placement:"satellite",attachTo:"mcu",anchor:pin("U5","4") });
block("temperature", ["R41","TH1","C54"], "analog", { placement:"satellite",attachTo:"mcu",anchor:pin("U5","38") });
bypass(["C25"], pin("U5","2"), "high");
capCluster(["C24","C25"],{powerNet:"3V3",returnNet:"GND",target:pin("U5","2"),maxRows:1,gap:0.4,priority:"high"});
criticalPair(pin("C26","1"),pin("U5","3"),{maxDistance:4,hard:false});
criticalPair(pin("C27","1"),pin("U5","4"),{maxDistance:4,hard:false});
criticalPair(pin("C54","1"),pin("U5","38"),{maxDistance:4,hard:false});
// ADC belongs to the quiet input area. Ordinary SPI wiring reaches the MCU;
// do not pull the analog front end down into the modem/power escape area.

block("usb_port", ["J5","R30","R31","F1","C41"], "connector");
block("usb_charger", ["U11","R32","R33","R34","R35","R36","R37","C42","C43"], "power", { anchor: comp("J5") });
block("battery_port", ["J6"], "connector", { anchor: comp("U11") });
block("battery_temperature_port", ["J7"], "connector", { anchor: pin("U11","1") });
block("system_converter", ["U12","L2","C44","C45","C46","C47"], "power", { anchor: comp("U5") });
coreIsland("system_switch",["U12","L2"],{pairs:[[pin("U12","4"),pin("L2","1")],[pin("U12","2"),pin("L2","2")]],maxDistance:4,hard:true,preferFacingPads:true});
capCluster(["C45","C46"], { powerNet: "3V3", returnNet: "GND", target: pin("U12","1"), maxRows: 1 });
bypass(["C44","C47"],pin("U12","5"),"high");
bypass(["C41"],pin("U11","13"),"high");
bypass(["C42"],pin("U11","10"),"high");
bypass(["C43"],pin("U11","2"),"high");
near(comp("U11"),comp("J5"),"high");
near(comp("U11"),comp("J6"),"high");
near(comp("U12"),comp("U5"),"high");
signalPath("usb_dp", [[pin("J5","A6"),pin("U5","14")]], { priority: "high" });
signalPath("usb_dm", [[pin("J5","A7"),pin("U5","13")]], { priority: "high" });

block("modem", ["U6"], "rf");
// Footprint pad 60 is at local (0,12): 270 degrees exposes it toward right U.FL.
component("U6").rotations(270);
// Bias the module below the measurement boundary, keeping top pad escape space.
near(comp("U6"),anchor("board.bottom_right"),"normal");
block("modem_1v8",["C28"],"rf",{placement:"satellite",attachTo:"modem",anchor:pin("U6","15")});
for(const [ic,cap,mp] of [["U7","C29","10"],["U8","C30","9"],["U9","C31","3"]]) {
  block("translation_"+ic,[ic,cap],"generic");
  near(comp(ic),pin("U6",mp),"high");
  near(comp(ic),comp("U5"),"normal");
}
block("modem_key", ["Q1","R22","R23"], "generic", { anchor: pin("U6","1") });
block("sim", ["J3","R24","R25","R26","C32"], "connector", { anchor: comp("U6") });
block("antenna", ["J4"], "rf", { anchor: pin("U6","60") });
block("modem_converter", ["U10","L1","C33","C34","C35"], "power");
block("modem_feedback",["R27","R28"],"power",{placement:"satellite",attachTo:"modem_converter",anchor:pin("U10","5")});
block("modem_controls",["R29","R42"],"power",{placement:"satellite",attachTo:"modem_converter",anchor:pin("U10","14"),allowDisconnected:true});
near(comp("U10"),pin("U6","55"),"high");
near(comp("Q1"),pin("U6","1"),"high");
near(comp("J3"),pin("U6","31"),"high");
block("modem_bulk", ["C36","C37","C38","C39","C40"], "power", { placement: "satellite", attachTo: "modem", anchor: pin("U6","55") });
coreIsland("lte_switch",["U10","L1"],{pairs:[[pin("U10","11"),pin("L1","1")],[pin("U10","9"),pin("L1","2")]],maxDistance:4,hard:true,preferFacingPads:true});
capCluster(["C34","C35"],{powerNet:"SYS",returnNet:"GND",target:pin("U10","12"),maxRows:1,gap:0.4,priority:"high"});
bypass(["C33"],pin("U10","3"),"high");
criticalPair(pin("R28","1"),pin("U10","5"),{maxDistance:3,hard:false});
away(comp("R28"),comp("L1"),"high");
capCluster(["C36","C37","C38"],{ powerNet:"LTE_3V8", returnNet:"GND", target:pin("U6","55"), maxRows:1 });
bypass(["C40"],pin("U6","55"),"high");
for (const [cap, ic] of [["C29","U7"],["C30","U8"],["C31","U9"]]) bypass([cap],pin(ic,"1"),"high");
// RF feed must escape toward the U.FL side, not traverse the module body.
criticalPair(pin("U6","60"),pin("J4","2"),{ maxDistance:8, priority:"critical", hard:true,preferFacingPads:true });
for (const [name, modemPin, resistor, simPin] of [["data","31","R24","C6"],["clock","32","R25","C5"],["reset","33","R26","C3"]])
  signalPath("sim_"+name,[[pin("U6",modemPin),pin(resistor,"1")],[pin(resistor,"2"),pin("J3",simPin)]],{priority:"high"});
away(block("modem"), block("adc"), "high");
away(block("modem_converter"), block("adc_voltage_input"), "high");

// Separate positive/negative measured-input harvesting chains; do not merge returns.
for (const [suffix, diode, buck, inCap, coil, outCaps, iso, ldo, isoCap, load, charger, chargerCaps, support] of [
  ["positive","D1","U13","C48","L3",["C49","C50"],"U14","U15","C51","R38","U16",["C52","C53"],["R39","R40","R43","Q2","TH2","R48","C61"]],
  ["negative","D2","U17","C55","L4",["C56","C57"],"U18","U19","C58","R44","U20",["C59","C60"],["R45","R46","R47","Q3","TH3","R49","C62"]]
]) {
  const core = "harvest_"+suffix;
  block(core,[diode,buck,inCap,coil],"power");
  block(core+"_output",outCaps,"power",{placement:"satellite",attachTo:core,anchor:pin(coil,"2")});
  // The harvested input may use a longer feed; switching loops stay local.
  // J1 also feeds the sensitive divider, so attracting both here mixes domains.
  near(comp(buck),anchor("board.top_left"),"high");
  block(core+"_isolation",[iso,ldo,isoCap,load],"power",{anchor:comp(buck)});
  block(core+"_charger",[charger,...chargerCaps,...support],"power",{anchor:comp(ldo)});
  coreIsland(core+"_switch",[buck,coil],{pairs:[[pin(buck,"1"),pin(coil,"1")]],maxDistance:5,hard:true,preferFacingPads:true});
  criticalPair(pin(buck,"3"),pin(inCap,"1"),{maxDistance:4,hard:false});
  capCluster(outCaps,{powerNet:suffix==="positive"?"HV_3V3":"HV_3V3_NEG",returnNet:suffix==="positive"?"V_MEAS_N":"HARVEST_P",target:pin(coil,"2"),maxRows:1,gap:0.4,priority:"high"});
  near(comp(iso),pin(coil,"2"),"high");
  near(comp(ldo),pin(iso,"4"),"high");
  near(comp(charger),pin(ldo,"5"),"high");
  bypass([isoCap],pin(ldo,"1"),"high");
  bypass([chargerCaps[0]],pin(charger,"A2"),"high");
  bypass([chargerCaps[1]],pin(charger,"A1"),"high");
  primitive.thermalPad(core+"_ep",{at:pin(buck,"17"),power:{dissipation:0.25,maxTemperatureRise:30},thetaJC:10,limits:{maxSize:{width:10,height:10}}});
}
// Provisional loss budgets, not measured loads. Grounded EPs need real via fields.
primitive.thermalPad("usb_charger_ep",{at:pin("U11","17"),power:{dissipation:1,maxTemperatureRise:35},thetaJC:3.8,limits:{maxSize:{width:16,height:16}}});
primitive.thermalPad("system_converter_ep",{at:pin("U12","11"),power:{dissipation:0.5,maxTemperatureRise:30},thetaJC:6.3,limits:{maxSize:{width:12,height:12}}});
// U10 HR package dissipates through power/GND lands; no exposed pad in this device.
// Reserve copper at U10 PGND during routing. R6, R38/R44, D1/D2 and isolated
// modules require sized current/heat copper. U15/U19 use ground/lead spreading.
// U16/U20 wafer chargers use their ground balls; Q1/Q2/Q3 and U3 are low-power.
// U1/U2 internal isolated converters, U4 and U7/U8/U9 need local bypass/returns.
// U5/U6 module heat spreading uses their real ground pads, not invented EPs.
for(let i=1;i<=20;i++) component("U"+i).role("main_ic").top();
for(let i=1;i<=7;i++) component("J"+i).role("connector").top();
for(const ref of ["SW1","SW2"]) component(ref).role("connector").top();

// KF301 screw-terminal opening is top at zero degrees; pad asymmetry incorrectly
// infers left, so specify the verified source-footprint mating face explicitly.
component("J1").faceAt0("top").edgeMount("right",{y:-17.5,overhang:0,face:"outward"});
component("J2").faceAt0("top").edgeMount("right",{y:-32,overhang:0,face:"outward"});
component("J5").edgeMount("left",{y:16,overhang:0.5,face:"outward"});
component("J6").faceAt0("top").edgeMount("top",{x:13.5,overhang:0,face:"outward"});
// Vertical battery NTC and hinged SIM holder are accessed from above.
component("J7").fixed({x:-44,y:-3,rotate:90,layer:"top"});
component("J3").fixed({x:26,y:36,rotate:0,layer:"top"});
component("J4").fixed({x:46,y:14,rotate:270,layer:"top"});
component("SW1").fixed({x:-29,y:35,rotate:0,layer:"top"});
component("SW2").fixed({x:5,y:35,rotate:0,layer:"top"});
// Exact notch-relative antenna placement: pads end at y=42.4113 (<43-0.5),
// body ends at y=49.4519. edgeMount targets the outer bbox, not the notch edge.
component("U5").rotations(0).fixed({x:-11,y:36.25,rotate:0,layer:"top"});
constraintRegion("wifi_antenna_notch",{shape:region.rect({anchor:anchor("board.center"),width:22,height:7,offset:{x:-11,y:46.5}}),layers:["top","bottom"],allow:{blocks:["mcu"]}});
// U.FL is vertical: reserve plug access locally, not a fictitious edge opening.
constraintRegion("lte_coax_access",{shape:region.rect({anchor:anchor("board.center"),width:5,height:5,offset:{x:46,y:14}}),layers:["top"],allow:{blocks:["antenna"]}});

// Functional floorplan, not fixed electrical coordinates. Reserve the upper
// right half for measurement and its supply switch; no switching/charging/RF
// component may enter this area. Satellites are named explicitly for readback.
constraintRegion("quiet_measurement_area",{
  shape:region.rect({anchor:anchor("board.center"),width:50,height:47,offset:{x:25,y:-26.5}}),
  layers:["top"],allow:{blocks:["voltage_port","harvest_fuse","voltage_divider",
    "voltage_isolation","current_port","current_filter","current_isolation",
    "afe_supply","adc","adc_voltage_input","adc_current_input","battery_port"]}
});
// Keep the reciprocal upper-left area available for the two harvesting chains
// and battery/USB power. Block bodies must stay on their own side of the
// boundary; the solver keeps electrical support parts movable within each area.
constraintRegion("power_area",{
  shape:region.rect({anchor:anchor("board.center"),width:50,height:47,offset:{x:-25,y:-26.5}}),
  layers:["top"],allow:{blocks:["harvest_fuse","harvest_positive","harvest_positive_output",
    "harvest_positive_isolation","harvest_positive_charger","harvest_negative",
    "harvest_negative_output","harvest_negative_isolation","harvest_negative_charger",
    "usb_charger","system_converter","battery_port","battery_temperature_port"]}
});

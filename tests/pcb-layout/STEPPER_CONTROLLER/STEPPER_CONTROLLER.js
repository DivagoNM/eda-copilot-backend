// Full re-placement, current local backend. Two-layer motor controller.
// 45 mm width retained; height grows from 60 to 66 mm (+3 mm at each end).
// NEMA17 mounting pattern stays 31 x 31 mm, centered at (0,11.8).
// Top motor face is clear. AS5600 is on bottom, centered on the motor axis.
board.polygon([
  {x:20.5,y:-33},
  {x:20.89,y:-32.962},
  {x:21.265,y:-32.848},
  {x:21.611,y:-32.663},
  {x:21.914,y:-32.414},
  {x:22.163,y:-32.111},
  {x:22.348,y:-31.765},
  {x:22.462,y:-31.39},
  {x:22.5,y:-31},
  {x:22.5,y:31},
  {x:22.462,y:31.39},
  {x:22.348,y:31.765},
  {x:22.163,y:32.111},
  {x:21.914,y:32.414},
  {x:21.611,y:32.663},
  {x:21.265,y:32.848},
  {x:20.89,y:32.962},
  {x:20.5,y:33},
  {x:7.7,y:33},
  {x:7.7,y:27.5},
  {x:-7.7,y:27.5},
  {x:-7.7,y:33},
  {x:-20.5,y:33},
  {x:-20.89,y:32.962},
  {x:-21.265,y:32.848},
  {x:-21.611,y:32.663},
  {x:-21.914,y:32.414},
  {x:-22.163,y:32.111},
  {x:-22.348,y:31.765},
  {x:-22.462,y:31.39},
  {x:-22.5,y:31},
  {x:-22.5,y:-31},
  {x:-22.462,y:-31.39},
  {x:-22.348,y:-31.765},
  {x:-22.163,y:-32.111},
  {x:-21.914,y:-32.414},
  {x:-21.611,y:-32.663},
  {x:-21.265,y:-32.848},
  {x:-20.89,y:-32.962},
  {x:-20.5,y:-33}
], {layers:["top","bottom"],defaultLayer:"bottom",clearance:0.35,edge:0.6});
solver({ grid: 0.5, fallbackGrid: 1, ignoredSignals: ["GND"], compactness: "normal" });
silkscreen.designators({ height: 0.75, rotations: [0,90], margin: 0.15 });

block("motor_mount", ["SCREW1","SCREW2","SCREW3","SCREW4"], "connector", {allowDisconnected:true});
for (const [ref,x,y] of [["SCREW1",-15.5,-3.7],["SCREW2",15.5,-3.7],
  ["SCREW3",-15.5,27.3],["SCREW4",15.5,27.3]]) {
  component(ref).role("connector").top().fixed({x,y,rotate:0,layer:"top"});
  // M3 head/washer and screwdriver access, 8 x 8 mm on BOTH sides.
  constraintRegion(ref+"_tool_access", {shape:region.rect({anchor:anchor("board.center"),
    width:8,height:8,offset:{x,y}}),layers:["top","bottom"],allow:{blocks:["motor_mount"]}});
}
// Entire 42.3 mm motor face, rather than just the square between the holes.
constraintRegion("NEMA17_top_face", {shape:region.rect({anchor:anchor("board.center"),
  width:42.3,height:42.3,offset:{x:0,y:11.8}}),layers:["top"],
  // User-approved flush USB retention tabs do not obstruct the motor on TOP.
  // Retain pad geometry for electrical collisions and all screw-access checks.
  allow:{blocks:["motor_mount","usb_data","usb_pd_port","usb_uart_port"]}});

// Protruding driver/module/header pins stay in the upper extension.
// Flush bottom USB retention tabs are permitted under the motor by the user.
block("driver", ["DD1","C26","R27","R40","R41","D16","D17"], "power");
block("driver_bulk", ["C34"], "power", {placement:"satellite",attachTo:"driver",anchor:pin("DD1","9")});
block("motor_port", ["U7"], "connector");
block("diag_port", ["J1"], "connector");
component("DD1").role("main_ic").top().fixed({x:-4.563,y:-23,rotate:90,layer:"top"});
for(const ref of ["C26","R27","R40","R41","D16","D17","C34"]) component(ref).top();
component("U7").role("connector").top().fixed({x:14,y:-28.952,rotate:0,layer:"top"});
component("J1").role("connector").top().fixed({x:7,y:-12,rotate:0,layer:"top"});
for(const [name,refs,portPin,driverPin] of [
  ["B2",["D5","D9"],"1","11"],["B1",["D6","D10"],"2","12"],
  ["A1",["D7","D11"],"3","13"],["A2",["D8","D12"],"4","14"]]) {
  block("clamp_"+name,refs,"power",{placement:"satellite",attachTo:"motor_port",anchor:pin("U7",portPin)});
  refs.forEach(ref=>component(ref).bottom().role("passive"));
  signalPath("motor_"+name,[[pin("DD1",driverPin),pin("U7",portPin)]],{priority:"high"});
}
near(comp("DD1"),anchor("board.top_left"),"high");
near(pin("DD1","9"),pin("USB2","2"),"high");
bypass(["C26"],pin("DD1","15"),"high");
bypass(["C34"],pin("DD1","9"),"high");

block("usb_data", ["USB1","C2","R9","R38","R39","D1","D2"], "connector");
block("usb_series", ["R30","R31"], "mcu", {placement:"satellite",attachTo:"mcu",anchor:pin("U4","26"),allowDisconnected:true});
block("usb_pd_port", ["USB2","R8","R10"], "connector");
block("usb_uart_port", ["USB3"], "connector");
component("USB1").role("connector").bottom().edgeMount("left",{y:6,overhang:0.5,face:"outward"});
component("USB2").role("connector").bottom().edgeMount("left",{y:-23,overhang:0.5,face:"outward"});
component("USB3").role("connector").bottom().edgeMount("right",{y:6,overhang:0.5,face:"outward"});
signalPath("USB_DP",[[pin("USB1","6"),pin("R30","1")],[pin("R30","2"),pin("U4","27")]],{priority:"critical",preferFacingPads:true});
signalPath("USB_DN",[[pin("USB1","5"),pin("R31","1")],[pin("R31","2"),pin("U4","26")]],{priority:"critical",preferFacingPads:true});

block("pd_controller", ["U9","C33","R12","R13","R26","R28","R29","R42","LED2"], "power");
component("U9").role("main_ic").bottom();
bypass(["C33"],pin("U9","1"),"high");
near(pin("U9","7"),pin("USB2","4"),"high");
near(pin("U9","6"),pin("USB2","10"),"high");
block("ideal_diode", ["U12","Q2","C41"], "power");
component("U12").role("main_ic").bottom();
coreIsland("ideal_diode_gate",["U12","Q2"],{pairs:[[pin("U12","3"),pin("Q2","1")]],maxDistance:4,hard:true});
near(pin("U12","1"),pin("USB2","2"),"high");
near(pin("U12","4"),pin("USB1","2"),"normal");

block("buck", ["U10","U11","C37"], "power");
block("buck_input", ["C35","C36","C40","R37"], "power",{placement:"satellite",attachTo:"buck",anchor:pin("U10","3")});
block("buck_feedback", ["R32","R33","C39"], "analog",{placement:"satellite",attachTo:"buck",anchor:pin("U10","4")});
block("buck_output", ["C42","C43","R34"], "power",{placement:"satellite",attachTo:"buck",anchor:pin("U11","1")});
component("U10").role("main_ic").bottom();
component("U11").role("passive").bottom();
coreIsland("buck_switch_bootstrap",["U10","U11","C37"],{pairs:[
  [pin("U10","2"),pin("U11","2")],[pin("U10","6"),pin("C37","1")],
  [pin("U10","2"),pin("C37","2")]],maxDistance:3,hard:true});
capCluster(["C35","C36","C40"],{powerNet:"$1N31277",returnNet:"GND",target:pin("U10","3"),gap:0.35});
capCluster(["C42","C43"],{powerNet:"$1N15676",returnNet:"GND",target:pin("U11","1"),gap:0.35});
near(comp("U10"),anchor("board.left"),"high");
away(comp("U11"),comp("U1"),"high");
away(comp("U11"),comp("R32"),"high");

block("encoder", ["U1","C1","R7"], "sensor");
block("i2c_pullups", ["R1","R6"], "sensor",{placement:"satellite",attachTo:"encoder",anchor:pin("U1","6")});
block("encoder_port", ["CN1"], "connector");
component("U1").role("main_ic").bottom().fixed({x:0,y:11.8,rotate:0,layer:"bottom"});
component("CN1").role("connector").bottom().edgeMount("right",{y:17,overhang:0,face:"outward"});
bypass(["C1"],pin("U1","1"),"high");
near(pin("R7","2"),pin("U1","8"),"high");
near(pin("CN1","3"),pin("U1","6"),"high");
near(pin("CN1","4"),pin("U1","7"),"high");

block("mcu", ["U4"], "mcu");
block("mcu_supply", ["C21","C24","C32","D40"], "mcu",{placement:"satellite",attachTo:"mcu",anchor:pin("U4","3")});
block("reset_support", ["R25","C13"], "mcu",{placement:"satellite",attachTo:"mcu",anchor:pin("U4","8")});
block("boot_support", ["R20","C8"], "mcu",{placement:"satellite",attachTo:"mcu",anchor:pin("U4","23")});
block("reset_button", ["SW1"], "connector");
block("boot_button", ["SW2"], "connector");
// Antenna lies over a 15.4 x 5.5 mm open notch; module stays inside 45 x 66 mm.
// Last pad ends at y=26.8499, leaving 0.6501 mm to the notch root at y=27.5.
component("U4").role("main_ic").bottom().fixed({x:0,y:24.25,rotate:0,layer:"bottom"});
constraintRegion("wifi_antenna_tail",{shape:region.rect({anchor:anchor("board.center"),width:15.4,height:5.5,offset:{x:0,y:30.25}}),
  layers:["top","bottom"],allow:{blocks:["mcu"]}});
component("SW1").role("connector").bottom().edgePlace("left",{y:19,inset:1,face:"any"});
component("SW2").role("connector").bottom().edgePlace("right",{y:-11,inset:1,face:"any"});
bypass(["C21","C24","C32"],pin("U4","3"),"high");
near(pin("SW1","2"),pin("U4","8"),"high");
near(pin("SW2","1"),pin("U4","23"),"high");
signalPath("STEP",[[pin("U4","13"),pin("DD1","7")]],{priority:"high"});
signalPath("DIR",[[pin("U4","12"),pin("DD1","8")]],{priority:"high"});
signalPath("driver_TX",[[pin("U4","20"),pin("R40","2")],[pin("R40","1"),pin("DD1","4")]],{priority:"high"});
signalPath("driver_RX",[[pin("U4","21"),pin("R41","2")],[pin("R41","1"),pin("DD1","5")]],{priority:"high"});

for(const [name,led,r,parent,p] of [["logic","LED1","R4","mcu","3"],
  ["motor_power","LED4","R36","driver","9"],["step","LED3","R16","driver","7"],
  ["diag","LED6","R18","driver","18"]]) {
  // Board-level functional pairs retain electrical attraction but may relocate
  // independently of the mechanically fixed driver/ESP family.
  block("status_"+name,[led,r],"generic");
  near(comp(r),pin(parent==="mcu"?"U4":"DD1",p),"normal");
  component(led).role("indicator").bottom();
}
// Bottom-side status pairs of the top driver remain independently movable.
// Thermal plan: DD1 is a socketed module with its own heatsink, no invented EP.
// U10/Q2/U11 use wide lead copper and vias during routing; leave encoder quiet.
// CH224K U9 is low dissipation: grounded EP needs local return, no power-via array.
// Motor-face placement keepout is not a copper keepout. Plan insulated motor
// standoffs and a continuous GND reference; do not route motor current under U1.

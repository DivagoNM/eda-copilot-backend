// STM32G0 CAN RS485 Controller 60x40: complete three-page EasyEDA netlist.
// Two copper layers, with all components assembled on top as in the source PCB.
board.rect(60, 40, { layers: ["top", "bottom"], defaultLayer: "top", clearance: 0.35, edge: 0.5 });
solver({ grid: 0.5, ignoredSignals: ["GND"], compactness: "normal" });
silkscreen.designators({ height: 1, rotations: [0, 90], margin: 0.25 });

// Keep the source board's edge assignment, while allowing ports to slide.
// Headers are accessed from above; only the terminal blocks need outward facing.
for (const [ref, side, position, face] of [
  ["J1", "left", 7, "outward"],
  ["J4", "right", 7, "outward"],
  ["J5", "right", -7, "outward"],
  ["J2", "bottom", 7, "any"],
  ["J3", "top", -5.1, "any"],
  ["SW1", "bottom", -10, "any"],
  ["SW2", "top", 13, "any"],
]) {
  block(`port_${ref}`, [ref], "connector");
  component(ref).role("connector").top().edgePlace(side, {
    inset: 0.5, face, layer: "top",
    ...(side === "left" || side === "right" ? { y: position } : { x: position }),
  });
}

// Protected 9-16 V input -> 5 V asynchronous buck -> 3.3 V LDO.
block("input_protection", ["F1", "D1", "D2", "TP1"], "power", { anchor: comp("J1") });
block("buck_core", ["U1", "L1", "D3", "C4"], "power", { anchor: anchor("board.left") });
block("buck_input", ["C1", "C2", "C3", "R3"], "power", {
  placement: "satellite", attachTo: "buck_core", anchor: pin("U1", "5"),
});
block("buck_output", ["C5", "C6", "TP2"], "power", {
  placement: "satellite", attachTo: "buck_core", anchor: pin("L1", "2"),
});
block("buck_feedback", ["R1", "R2"], "analog", {
  placement: "satellite", attachTo: "buck_core", anchor: pin("U1", "3"),
});
block("ldo", ["U2", "C7", "C8", "C9", "TP3"], "power");
block("power_indicator", ["LED1", "R4"], "generic", { anchor: comp("J1") });
block("ground_test", ["TP4"], "generic", { anchor: comp("TP1") });
near(block("power_indicator"), comp("J1"), "high");

// LMR16006: SW=6, VIN=5, FB=3, CB=1, GND=2. Only SW-to-L1 is hard.
coreIsland("buck_switch_node", ["U1", "L1"], {
  pairs: [[pin("U1", "6"), pin("L1", "1")]],
  maxDistance: 5, hard: true, preferFacingPads: true,
});
criticalPair(pin("U1", "6"), pin("D3", "1"), { maxDistance: 4, hard: false, preferFacingPads: true });
criticalPair(pin("U1", "1"), pin("C4", "1"), { maxDistance: 3, hard: false });
criticalPair(pin("U1", "6"), pin("C4", "2"), { maxDistance: 3, hard: false });
criticalPair(pin("U1", "5"), pin("C3", "1"), { maxDistance: 3, hard: false });
criticalPair(pin("U1", "2"), pin("C3", "2"), { maxDistance: 4, hard: false });
criticalPair(pin("U1", "3"), pin("R2", "1"), { maxDistance: 3, hard: false });
criticalPair(pin("R1", "2"), pin("R2", "1"), { maxDistance: 2.5, hard: false });
capCluster(["C1", "C2"], { powerNet: "VIN_PROT", returnNet: "GND", target: pin("U1", "5"), maxRows: 1, priority: "high" });
capCluster(["C5", "C6"], { powerNet: "+5V", returnNet: "GND", target: pin("L1", "2"), maxRows: 1, priority: "high" });
away(block("buck_feedback"), comp("L1"), "high");
near(block("input_protection"), block("buck_input"), "high");
bypass(["C7"], pin("U2", "1"), "high");
bypass(["C9"], pin("U2", "5"), "high");
near(comp("C8"), pin("U2", "5"), "high");

// MCU and supplies. The exported LQFP48 symbol has VDD/VDDA=6, VREF+=5, VBAT=4.
block("mcu", ["U3"], "mcu", { anchor: anchor("board.center") });
block("mcu_supply", ["C10", "C11", "C12", "C13"], "mcu", {
  placement: "satellite", attachTo: "mcu", anchor: pin("U3", "6"),
});
block("mcu_reference", ["C14"], "analog", {
  placement: "satellite", attachTo: "mcu", anchor: pin("U3", "5"),
});
bypass(["C10", "C12", "C13"], pin("U3", "6"), "high");
bypass(["C14"], pin("U3", "5"), "high");
near(comp("C11"), pin("U3", "6"), "high");

// X1 is an active 8 MHz oscillator: output=3, VCC=4; no crystal load caps.
block("clock", ["X1", "R8", "C15"], "generic", {
  placement: "satellite", attachTo: "mcu", anchor: pin("U3", "8"),
});
bypass(["C15"], pin("X1", "4"), "high");
signalPath("hse_clock", [
  [pin("X1", "3"), pin("R8", "1"), { maxDistance: 3 }],
  [pin("R8", "2"), pin("U3", "8"), { maxDistance: 6 }],
], { priority: "high", hard: false });
away(comp("X1"), comp("L1"), "high");

block("reset", ["R5", "C16", "TP5"], "mcu", {
  placement: "satellite", attachTo: "mcu", anchor: pin("U3", "10"),
});
block("user_button_filter", ["R6", "C17"], "mcu", { anchor: comp("SW2") });
block("swd_boot", ["R7"], "mcu", {
  placement: "satellite", attachTo: "mcu", anchor: pin("U3", "36"),
});
block("led_a", ["R9", "LED2"], "generic", { anchor: anchor("board.top") });
block("led_b", ["R10", "LED3"], "generic", { anchor: anchor("board.top") });
near(block("user_button_filter"), comp("SW2"), "high");
near(block("led_a"), pin("U3", "19"), "normal");
near(block("led_b"), pin("U3", "20"), "normal");
near(block("led_a"), anchor("board.top"), "high");
near(block("led_b"), anchor("board.top"), "high");
near(block("reset"), comp("SW1"), "normal");
near(comp("J2"), comp("U3"), "high");
near(comp("J3"), comp("U3"), "normal");

// CAN: separate 5 V VCC and 3.3 V VIO bypass, ESD shunts at the connector.
block("can", ["U4", "R13", "C18", "C19", "C20"], "generic", { anchor: comp("J4") });
block("can_protection", ["D4"], "generic", { anchor: comp("J4") });
block("can_termination", ["R11", "JP1"], "generic", { anchor: comp("J4") });
bypass(["C18"], pin("U4", "3"), "high");
bypass(["C19"], pin("U4", "5"), "high");
near(comp("C20"), pin("U4", "3"), "high");
criticalPair(pin("R11", "1"), pin("U4", "7"), { maxDistance: 7, priority: "high", hard: false });
criticalPair(pin("JP1", "2"), pin("U4", "6"), { maxDistance: 7, priority: "high", hard: false });
signalPath("can_h", [[pin("U4", "7"), pin("D4", "1")], [pin("D4", "1"), pin("J4", "1"), { maxDistance: 5 }]], { priority: "high" });
signalPath("can_l", [[pin("U4", "6"), pin("D4", "2")], [pin("D4", "2"), pin("J4", "2"), { maxDistance: 5 }]], { priority: "high" });

// RS485: shared DE/RE control, defaults and local 3.3 V supply.
block("rs485", ["U5", "R14", "R15", "R16", "C21", "C22"], "generic", { anchor: comp("J5") });
block("rs485_protection", ["D5"], "generic", { anchor: comp("J5") });
block("rs485_termination", ["R12", "JP2"], "generic", { anchor: comp("J5") });
bypass(["C21"], pin("U5", "8"), "high");
near(comp("C22"), pin("U5", "8"), "high");
criticalPair(pin("R12", "1"), pin("U5", "6"), { maxDistance: 7, priority: "high", hard: false });
criticalPair(pin("JP2", "2"), pin("U5", "7"), { maxDistance: 7, priority: "high", hard: false });
signalPath("rs485_a", [[pin("U5", "6"), pin("D5", "1")], [pin("D5", "1"), pin("J5", "1"), { maxDistance: 5 }]], { priority: "high" });
signalPath("rs485_b", [[pin("U5", "7"), pin("D5", "2")], [pin("D5", "2"), pin("J5", "2"), { maxDistance: 5 }]], { priority: "high" });

for (const ref of ["U1", "U2", "U3", "U4", "U5", "X1"]) component(ref).role("main_ic").top();
for (let i = 1; i <= 22; i++) component(`C${i}`).role(i === 4 || i === 16 || i === 17 ? "passive" : "decoupling_cap").top();
for (const ref of ["LED1", "LED2", "LED3"]) component(ref).role("indicator").top();
for (const ref of ["JP1", "JP2", "TP1", "TP2", "TP3", "TP4", "TP5"]) component(ref).role("connector").top();
for (const ref of ["F1", "D1", "D2", "D3", "D4", "D5", "L1", ...Array.from({ length: 16 }, (_, i) => `R${i + 1}`)]) component(ref).role("passive").top();

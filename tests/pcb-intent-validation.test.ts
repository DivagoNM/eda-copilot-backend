import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePcbLayoutIntent, detectCircuitPatterns } from '../src/pcb.ts';
import { validatePcbLayoutIntent as rootValidator } from '../src/index.ts';
import { runPcbLayoutDsl } from '../src/pcb-layout/pcb-layout-dsl/spec.ts';
import type { ExplainCircuit } from '../src/types/circuit.ts';
import type { FootprintSpec } from '../src/types/pcb/layout-model.ts';

const component = (designator: string, pins: Array<[string | number, string, string]>) => ({
    designator, value: 'test', part_uuid: null, pins: pins.map(([pin_number, name, signal_name]) => ({ pin_number, name, signal_name })),
});
const bootstrap: ExplainCircuit = { components: [
    component('U1', [[1, 'BOOT', 'boot'], [2, 'SW', 'sw']]),
    component('C1', [[1, '1', 'boot'], [2, '2', 'sw']]),
] };
const base = 'block("power",["U1","C1"]);';
const validate = (code: string, circuit = bootstrap) => validatePcbLayoutIntent({ code, circuit, knowledge: {} });
const warnings = (code: string) => validate(code).filter(d => d.severity === 'warning');

test('public root and pcb exports expose the same offline validator', () => {
    assert.equal(rootValidator, validatePcbLayoutIntent);
    assert.ok(warnings(base).some(d => d.code === 'PCB_INTENT_BOOTSTRAP'));
});
test('pad pairs satisfy bootstrap intent; numeric/string identities are equivalent', () => {
    const code = base + 'criticalPair(pin("U1","1"),pin("C1",1)); criticalPair(pin("U1",2),pin("C1","2"));';
    assert.deepEqual(warnings(code), []);
});
test('signalPath expresses equivalent bootstrap pad locality', () => {
    assert.deepEqual(warnings(base + 'signalPath("boot",[[pin("U1",1),pin("C1",1)]]); signalPath("return",[[pin("C1",2),pin("U1",2)]]);'), []);
});
test('component-center attraction and low-priority pairs retain advisory warnings', () => {
    assert.ok(warnings(base + 'veryNear(comp("C1"),comp("U1"));').length);
    assert.ok(warnings(base + 'criticalPair(pin("U1",1),pin("C1",1),{priority:"low"});').length);
});
test('pin-specific near hints express locality without requiring a particular method', () => {
    assert.deepEqual(warnings(base + 'veryNear(pin("U1",1),pin("C1",1)); near(pin("C1",2),pin("U1",2),"high");'), []);
});
test('authored sparse localLayout expresses grouping and reports its physical limits', () => {
    const diagnostics = validate('block("power",["U1","C1"],"power",{localLayout:{U1:{x:0,y:0},C1:{x:2,y:0}}});');
    assert.equal(diagnostics.filter(d => d.severity === 'warning' || d.severity === 'error').length, 0);
    assert.ok(diagnostics.find(d => d.code === 'PCB_INTENT_COVERAGE')?.message.includes('localLayout'));
    assert.ok(validate('block("power",["U1","C1"],"power",{localLayout:{C1:{x:2}}});').some(d => d.code === 'PCB_LOCAL_LAYOUT'));
});
test('source positions subtract strict and localLayout preambles, including functions and loops', () => {
    const code = ['function place() {', '  block("power",["U1","C1"]);', '}', 'for (let i=0;i<1;i++) place();'].join('\n');
    const diagnostic = warnings(code)[0];
    assert.ok(diagnostic.context?.locations?.some(l => l.line === 2));
    const syntax = validate(base + '\nconst broken = ;')[0];
    assert.equal(syntax.code, 'PCB_DSL_EXECUTION');
    assert.equal(syntax.context?.locations?.[0].line, 2);
    const runtime = validate(base + '\nunknownDslMethod();')[0];
    assert.equal(runtime.context?.locations?.[0].line, 2);
    assert.equal('stack' in runtime, false);
});
test('tracing does not change executable DSL rules or fluent helper behavior', () => {
    const code = base + '\ncomponent("C1").role("decoupling_cap").layers("top"); criticalPair(pin("U1",1),pin("C1",1));';
    const calls: unknown[] = [];
    assert.deepEqual(structuredClone(runPcbLayoutDsl(code, { onCall: c => calls.push(c) })), structuredClone(runPcbLayoutDsl(code)));
    assert.ok(calls.length);
});
test('bad ownership, pin references, and input identities have structured errors', () => {
    assert.ok(validate('block("power",["U1"]);').some(d => d.code === 'PCB_BLOCK_OWNERSHIP' && d.severity === 'error'));
    assert.ok(validate(base + 'near(pin("U1",99),comp("C1"));').some(d => d.code === 'PCB_TARGET_REF'));
    const duplicate = structuredClone(bootstrap);
    duplicate.components.push(duplicate.components[0]);
    assert.ok(validate(base, duplicate).some(d => d.code === 'PCB_CIRCUIT_IDENTITY'));
    duplicate.components.pop();
    duplicate.components[0].pins.push({ ...duplicate.components[0].pins[0], pin_number: '1' });
    assert.ok(validate(base, duplicate).some(d => d.code === 'PCB_CIRCUIT_IDENTITY'));
    assert.equal(validatePcbLayoutIntent({ code: '', circuit: bootstrap })[0].code, 'PCB_INTENT_INPUT');
});
test('arbitrary-role fixed placements retain production validation semantics', () => {
    assert.equal(validate(base + 'fixed("C1",{x:2,y:0,layer:"top"});').some(d => d.code === 'PCB_FIXED_PLACEMENT'), false);
});
test('preview filtering limits motifs; malformed filter remains an error', () => {
    const result = validate(base + 'solver({placeOnlyComponents:["U1"]});');
    assert.ok(result.some(d => d.code === 'PCB_INTENT_PREVIEW_SCOPE'));
    assert.equal(result.some(d => d.code === 'PCB_INTENT_BOOTSTRAP'), false);
    assert.ok(validate(base + 'solver({placeOnlyComponents:["absent"]});').some(d => d.code === 'PCB_PREVIEW_FILTER'));
});
test('preserve requires its existing board but can keep components without explicit authored ownership', () => {
    assert.equal(validate('preserve({components:"all"});')[0].code, 'PCB_PRESERVE_CONTEXT');
    const existingPlacement = { board: { polygon: [{x:-10,y:-10},{x:10,y:-10},{x:10,y:10},{x:-10,y:10}] },
        components: [{designator:'U1',x:0,y:0,rotate:0,layer:'top' as const},{designator:'C1',x:2,y:0,rotate:0,layer:'top' as const}] };
    const result = validatePcbLayoutIntent({ code: 'preserve({board:true,components:"all"});', circuit: bootstrap, existingPlacement });
    assert.equal(result.some(d => d.severity === 'error'), false);
});
test('IC, inductor and diode without proven switch pins do not imply a buck converter', () => {
    const circuit = { components: [
        component('U1', [[1,'IN','a'],[2,'OUT','b'],[3,'GND','g']]),
        component('L1', [[1,'1','b'],[2,'2','c']]),
        component('D1', [[1,'A','g'],[2,'K','b']]),
        component('C1', [[1,'1','a'],[2,'2','g']]),
    ] };
    assert.equal(detectCircuitPatterns({ circuit }).some(m => m.patternId === 'buck-loop'), false);
});
test('synchronous buck core is recognized without an external diode', () => {
    const circuit = { components: [
        component('U1', [[1,'VIN','a'],[2,'SW','b'],[3,'GND','g']]),
        component('L1', [[1,'1','b'],[2,'2','c']]),
        component('C1', [[1,'1','a'],[2,'2','g']]),
    ] };
    assert.ok(detectCircuitPatterns({ circuit }).some(m => m.patternId === 'buck-loop'));
});
test('crystal core survives omitted optional load capacitors and overlapping bootstrap is retained', () => {
    const circuit = { components: [
        component('U1', [[1,'OSCIN','xi'],[2,'OSCOUT','xo'],[3,'GND','g'],[4,'BOOT','boot'],[5,'SW','sw']]),
        component('Y1', [[1,'1','xi'],[2,'2','xo']]), component('C1', [[1,'1','boot'],[2,'2','sw']]),
    ] };
    const matches = detectCircuitPatterns({ circuit });
    assert.ok(matches.some(m => m.patternId === 'crystal'));
    assert.ok(matches.some(m => m.patternId === 'bootstrap'));
});
test('ambiguous multi-channel op-amp names are skipped instead of mixing channels', () => {
    const circuit = { components: [
        component('U1', [[1,'OUT','out1'],[2,'IN-','sum1'],[3,'IN+','in1'],[4,'OUT','out2'],[5,'IN-','sum2'],[6,'IN+','in2']]),
        component('R1', [[1,'1','out1'],[2,'2','sum2']]),
    ] };
    assert.equal(detectCircuitPatterns({ circuit }).some(m => m.patternId === 'opamp-feedback'), false);
});
test('electrical net names stay exact; AGND and PGND are not merged', () => {
    const circuit = { components: [
        component('U1', [[1,'VCAP','cap'],[2,'GND','AGND']]),
        component('C1', [[1,'1','cap'],[2,'2','PGND']]),
    ] };
    assert.equal(detectCircuitPatterns({ circuit }).some(m => m.patternId === 'internal-regulator-cap'), false);
});
test('distributed supply groups detect one capCluster assigned only to a distant pin', () => {
    const circuit = { components: [
        component('U1', [[2,'VDD','v'],[40,'VDD','v'],[10,'GND','g']]),
        component('C1', [[1,'1','v'],[2,'2','g']]), component('C2', [[1,'1','v'],[2,'2','g']]),
    ] };
    const code = 'block("power",["U1","C1","C2"]); capCluster(["C1","C2"],{powerNet:"v",returnNet:"g",target:pin("U1",2)});';
    const knowledge = { components: { U1: { supplyGroups: [[2],[40]] } } };
    const result = validatePcbLayoutIntent({ code, circuit, knowledge });
    assert.ok(result.find(d => d.code === 'PCB_INTENT_DISTRIBUTED_SUPPLY')?.message.includes('U1.40'));
    const split = 'block("power",["U1","C1","C2"]); bypass(["C1"],pin("U1",2)); bypass(["C2"],pin("U1",40));';
    assert.equal(validatePcbLayoutIntent({ code: split, circuit, knowledge }).some(d => d.code === 'PCB_INTENT_DISTRIBUTED_SUPPLY'), false);
    const footprint: FootprintSpec = {name:'QFP',width:10,height:10,pads:[
        {pin_number:2,x:-5,y:0,width:1,height:1},{pin_number:40,x:5,y:0,width:1,height:1},{pin_number:10,x:0,y:5,width:1,height:1},
    ]};
    assert.ok(validatePcbLayoutIntent({ code, circuit, footprints: {U1:footprint} }).some(d => d.code === 'PCB_INTENT_DISTRIBUTED_SUPPLY'));
});
test('functional topology spans authored main and satellite blocks', () => {
    const code = 'block("power",["U1"]); block("boot",["C1"],"generic",{placement:"satellite",attachTo:"power"});';
    assert.ok(warnings(code).some(d => d.code === 'PCB_INTENT_BOOTSTRAP'));
});
test('isolation uses declared clearance rather than a generic away preference or guessed standard', () => {
    const circuit = { components: [component('U1', [[1,'VDD','v1']]), component('U2', [[1,'VDD','v2']])] };
    const knowledge = {isolation:{domains:{U1:'primary',U2:'secondary'},minClearance:5}};
    const code = 'block("a",["U1"]); block("b",["U2"]);';
    const check = (suffix: string) => validatePcbLayoutIntent({ code:code+suffix,circuit,knowledge });
    assert.ok(check('away(comp("U1"),comp("U2"));').some(d => d.code === 'PCB_INTENT_ISOLATION_DOMAINS'));
    assert.ok(check('clearance(comp("U1"),comp("U2"),4);').some(d => d.code === 'PCB_INTENT_ISOLATION_DOMAINS'));
    assert.equal(check('clearance(comp("U1"),comp("U2"),5);').some(d => d.code === 'PCB_INTENT_ISOLATION_DOMAINS'), false);
});
test('invalid verified profile refs cannot silently disable intended checks', () => {
    assert.ok(validatePcbLayoutIntent({code:base,circuit:bootstrap,knowledge:{components:{U1:{pinFunctions:{99:'BOOT'}}}}}).some(d => d.code === 'PCB_KNOWLEDGE_REF'));
    assert.ok(validatePcbLayoutIntent({code:base,circuit:bootstrap,knowledge:{components:{U1:{supplyGroups:[[1],[1]]}}}}).some(d => d.code === 'PCB_KNOWLEDGE_GROUP'));
});
test('bypass capacitors cannot be assigned to an electrically unrelated pin', () => {
    const circuit = {components:[
        component('U1', [[1,'VDD','v'],[2,'GND','g'],[3,'VCAP','internal']]),
        component('C1', [[1,'1','internal'],[2,'2','g']]),
    ]};
    const result = validate('block("power",["U1","C1"]); bypass(["C1"],pin("U1",1));', circuit);
    assert.ok(result.some(d => d.code === 'PCB_BYPASS_NET' && d.severity === 'error'));
});
test('synthetic boardPad terminals remain valid targets in the offline validator', () => {
    const code = base + 'boardPad("debug",{at:anchor("board.bottom"),pitch:1.27,layer:"top",pads:[[{name:"SW",net:"sw",shape:"round",diameter:1}]]});' +
        'block("debug",["debug"],"connector",{allowDisconnected:true}); near(pin("debug",1),pin("U1",2));';
    assert.equal(validate(code).some(d => d.severity === 'error'), false, JSON.stringify(validate(code)));
});
test('clearance(block, all) cannot satisfy separation within that same source block', () => {
    const circuit = {components:[component('U1',[[1,'VDD','a']]),component('U2',[[1,'VDD','b']])]};
    const knowledge = {isolation:{domains:{U1:'a',U2:'b'},minClearance:5}};
    const result = validatePcbLayoutIntent({code:'block("both",["U1","U2"],"generic",{allowDisconnected:true}); blockClearance("both","all",5);',circuit,knowledge});
    assert.ok(result.some(d => d.code === 'PCB_INTENT_ISOLATION_DOMAINS'));
});
test('confirmed supply groups identify numeric power pins and unknown mechanical targets report limited coverage', () => {
    const circuit = {components:[
        component('U1',[[2,'2','v'],[40,'40','v'],[10,'GND','g']]),component('C1',[[1,'1','v'],[2,'2','g']]),
    ]};
    assert.ok(detectCircuitPatterns({circuit,knowledge:{components:{U1:{supplyGroups:[[2],[40]]}}}}).some(m => m.patternId === 'distributed-supply'));
    const limited = validatePcbLayoutIntent({code:base,circuit:bootstrap,knowledge:{components:{U1:{placement:{purpose:'cold-junction'}}}}});
    assert.ok(limited.find(d => d.code === 'PCB_INTENT_COVERAGE')?.message.includes('profiles lack'));
});
test('confirmed device function profiles are required for context-specific termination checks', () => {
    const circuit = {components:[component('U1',[[1,'A','a'],[2,'B','b']]),component('R1',[[1,'1','a'],[2,'2','b']])]};
    assert.equal(detectCircuitPatterns({circuit}).some(m => m.patternId === 'rs485-termination'), false);
    assert.ok(detectCircuitPatterns({circuit,knowledge:{components:{U1:{functions:['rs485-endpoint']}}}}).some(m => m.patternId === 'rs485-termination'));
});
test('repeated identical return terminals are alternatives; different ground functions remain distinct', () => {
    const circuit = {components:[
        component('U1',[[1,'VCAP','internal'],[2,'GND','g'],[3,'GND','g']]),
        component('C1',[[1,'1','internal'],[2,'2','g']]),
    ]};
    const matches = detectCircuitPatterns({circuit}).filter(m => m.patternId === 'internal-regulator-cap');
    assert.equal(matches.length,1);
    assert.equal(matches[0].requirements[0].relation,'local');
    const code = 'block("power",["U1","C1"]); bypass(["C1"],pin("U1",1));';
    assert.equal(validate(code,circuit).some(d => d.code === 'PCB_INTENT_INTERNAL_REGULATOR_CAP'),false);
});
test('observer programming failures propagate; user throws and infinite loops become execution diagnostics', () => {
    const failure = new Error('test observer failure');
    assert.throws(() => runPcbLayoutDsl(base,{onCall:()=>{throw failure;}}),error => error === failure);
    assert.equal(validate(base+'throw null;')[0].code,'PCB_DSL_EXECUTION');
    assert.equal(validate(base+'throw {stack:42};')[0].code,'PCB_DSL_EXECUTION');
    assert.equal(validate(base+'while(true){}')[0].code,'PCB_DSL_EXECUTION');
});

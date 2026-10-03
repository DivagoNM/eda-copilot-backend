import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildPlacementGraph } from '../src/pcb-layout/pcb-auto-place/placement-graph.ts';
import { createClearanceResolver } from '../src/pcb-layout/pcb-auto-place/clearance-resolver.ts';
import { getPadWorld } from '../src/pcb-layout/pcb-auto-place/geometry.ts';
import { blockQuality, legalBlockCandidate } from '../src/pcb-layout/pcb-auto-place-v2/block-quality.ts';
import { blockPolicy } from '../src/pcb-layout/pcb-auto-place-v2/block-policy.ts';
import { encodeNativeBlockSolveProblem } from '../src/pcb-layout/pcb-auto-place-v2/native/encode-block-problem.ts';
import { rotatePrimitive, translatePrimitive } from '../src/pcb-layout/pcb-auto-place-v2/primitives.ts';
import type { PlacementInput } from '../src/types/pcb/layout-model.ts';
import type { PlacementPrimitive } from '../src/pcb-layout/pcb-auto-place-v2/primitives.ts';
import type { NativeBlockSolveProblemV4, NativeBlockSolveSolutionV4 } from '../src/pcb-layout/pcb-auto-place-v2/native/contract.ts';

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/block-placement/STM32G0_CAN_RS485/can-score.json',import.meta.url),'utf8')) as {
    input: PlacementInput; primitives: PlacementPrimitive[]; signalSide: PlacementPrimitive[];
};
function problem(input:PlacementInput, primitives:PlacementPrimitive[]) {
    const graph=buildPlacementGraph(input);
    return encodeNativeBlockSolveProblem({node:graph.tree,primitives,relations:graph.relations,options:{
        scoreInput:input,grid:.5,clearance:input.board.clearances.component,
        componentByDesignator:new Map(input.components.map(c=>[c.designator,c])),
        clearanceResolver:createClearanceResolver(input),...blockPolicy(input.solverOptions.ignoredRatsnestSignals),
    }});
}
function solve(p:NativeBlockSolveProblemV4, backend='cpu') {
    const child=spawnSync(process.execPath,['--input-type=module','-e',
        'import fs from "node:fs";import {createRequire} from "node:module";const a=createRequire(import.meta.url)("./native/pcb-board-packer/index.cjs");console.log(JSON.stringify(a.solveBlockPrimitives(JSON.parse(fs.readFileSync(0,"utf8")))));'],{
        input:JSON.stringify(p),encoding:'utf8',env:{...process.env,PCB_BLOCK_BACKEND:backend,PCB_BLOCK_SOLVER_THREADS:'1',
            PCB_BLOCK_SOLVER_PROFILE:'1', ...(backend==='cubecl'?{PCB_BLOCK_GPU_VERIFY:'1',PCB_BLOCK_GPU_VERIFY_PRUNE:'1'}:{})},
    });
    assert.equal(child.status,0,child.stderr);
    return {solution:JSON.parse(child.stdout) as NativeBlockSolveSolutionV4,log:child.stderr};
}
function frozenScore(p:NativeBlockSolveProblemV4) {
    p=structuredClone(p);p.primitives.forEach(p=>p.locked=true);
    return solve(p).solution.rank.score as number;
}

test('existing search ranks the legal R13 signal-side tradeoff on the checkpoint scale',()=>{
    const {input,primitives,signalSide}=fixture();
    const baseline=blockQuality(input,primitives),better=blockQuality(input,signalSide);
    assert.equal(legalBlockCandidate(input,signalSide,createClearanceResolver(input)),true);
    assert.ok(better.area>baseline.area && better.area<baseline.area*1.05);
    assert.ok(better.links['R13.2->U4']<3 && baseline.links['R13.2->U4']>7);
    for(const ps of [primitives,signalSide]) {
        const score=frozenScore(problem(input,ps));
        const checkpoint=blockQuality(input,ps).score;
        // Search connection points are transported at 0.001 mm; checkpoint
        // geometry resolves the original footprint pads. Compare their scale,
        // allowing that existing coordinate quantization, not different weights.
        assert.ok(Math.abs(score-checkpoint)<Math.max(.1,checkpoint*.0002),`${score} versus checkpoint ${checkpoint}`);
    }
    assert.ok(frozenScore(problem(input,signalSide))<frozenScore(problem(input,primitives)));
});

test('ignored GND does not suppress an explicitly authored soft pin distance',()=>{
    const {input,primitives}=fixture();
    input.hints.push({relation:'critical_pair',source:{type:'pin',designator:'U4',pin_number:'2'},
        target:{type:'pin',designator:'R13',pin_number:'1'},priority:'critical',hard:false,maxDistance:4});
    input.components.forEach(c=>c.pins.forEach(p=>p.signal_name='GND'));
    primitives.forEach(p=>p.connectionPoints.forEach(cp=>cp.net='GND'));
    const withRule=frozenScore(problem(input,primitives));
    const checkpoint=blockQuality(input,primitives).score;
    assert.ok(Math.abs(withRule-checkpoint)<Math.max(.1,checkpoint*.0002),`${withRule} versus checkpoint ${checkpoint}`);
    input.hints=input.hints.filter(h=>h.relation!=='critical_pair');
    const withoutRule=frozenScore(problem(input,primitives));
    assert.ok(withRule>withoutRule+1000);
});

test('the real buck family preserves explicit D3 GND and feedback clearance on the checkpoint scale',()=>{
    const {input,primitives}=JSON.parse(readFileSync(new URL('./fixtures/block-placement/STM32G0_CAN_RS485/buck-score.json',import.meta.url),'utf8')) as ReturnType<typeof fixture>;
    const encoded=problem(input,primitives);
    const ground=encoded.relations.find(r=>r.kind==='critical_pair'&&r.from==='pad:U1.2'&&r.to==='pad:D3.2');
    assert.deepEqual(ground?.score,{kind:'distance',weight:432,min:undefined,max:4});
    assert.ok(encoded.relations.some(r=>r.from==='block:buck_feedback'&&r.to==='component:L1'&&r.score?.kind==='clearance'));
    const score=frozenScore(encoded),checkpoint=blockQuality(input,primitives).score;
    assert.ok(Math.abs(score-checkpoint)<Math.max(.1,checkpoint*.0002),`${score} versus checkpoint ${checkpoint}`);
});

test('power aliases and switching nodes have the same weights in search and checkpoint scoring',()=>{
    for(const name of ['3V3','VREG_A','MCU_VDD','SW']) {
        const {input,primitives}=fixture();
        input.components.forEach(c=>c.pins.forEach(p=>{if(p.signal_name==='+3V3')p.signal_name=name;}));
        primitives.forEach(p=>p.connectionPoints.forEach(cp=>{if(cp.net==='+3V3')cp.net=name;}));
        const encoded=problem(input,primitives),score=frozenScore(encoded),checkpoint=blockQuality(input,primitives).score;
        assert.equal(encoded.netWeights![name],name==='SW'?1:.25);
        assert.ok(Math.abs(score-checkpoint)<Math.max(.1,checkpoint*.0002),`${name}: ${score} versus ${checkpoint}`);
    }
});

test('authored clearances and layer preferences use checkpoint geometry and penalties',()=>{
    const cases: PlacementInput['hints'][number][] = [
        {relation:'away_from',source:{type:'component',designator:'R13'},target:{type:'component',designator:'U4'},priority:'high'},
        {relation:'clearance',source:{type:'pin',designator:'R13',pin_number:'1'},target:{type:'component',designator:'U4'},min:8,priority:'high'},
        {relation:'clearance',source:{type:'component',designator:'R13'},target:'all',min:8,priority:'high'},
        {relation:'prefer_layer',source:{type:'component',designator:'R13'},layer:'bottom',priority:'high'},
        {relation:'same_side',source:{type:'component',designator:'R13'},target:{type:'component',designator:'U4'},priority:'high'},
    ];
    for(const hint of cases) {
        const {input,primitives}=fixture();
        input.hints.push(hint);
        if(hint.relation==='same_side') {
            const r=primitives.find(p=>p.placements.some(p=>p.designator==='R13'))!;
            r.placements[0].layer='bottom';
            // Mirror the actual pads as well as the pose, preserving a coherent
            // primitive rather than comparing top-pad geometry to a bottom pose.
            const c=input.components.find(c=>c.designator==='R13')!;
            r.connectionPoints.forEach(cp=>Object.assign(cp,getPadWorld(c,r.placements[0],cp.ref.split('.')[1])!));
        }
        const encoded=problem(input,primitives),score=frozenScore(encoded),checkpoint=blockQuality(input,primitives).score;
        assert.ok(Math.abs(score-checkpoint)<Math.max(.1,checkpoint*.0002),`${hint.relation}: ${score} versus ${checkpoint}`);
        if('target' in hint && hint.target==='all') {
            const terms=encoded.relations.filter(r=>r.id.includes(':checkpoint:'));
            assert.equal(terms.length,input.components.length-1);
            assert.ok(terms.every(r=>r.kind==='net'&&r.effect==='score_only'&&!r.hard));
        }
    }
});

test('aligned live GPU search preserves legality and checkpoint quality on the pin/power tradeoff',{
    skip:process.env.PCB_BLOCK_GPU_TEST!=='1',
},()=>{
    const {input,primitives}=fixture();
    const p=problem(input,primitives),cpu=solve(p),gpu=solve(p,'cubecl');
    assert.doesNotMatch(gpu.log,/block-gpu-fallback/);
    assert.match(gpu.log,/"backend":"cubecl"/);
    for(const result of [cpu,gpu]) {
        const ps=primitives.map(p=>{
            const s=result.solution.states.find(s=>s.primitiveId===p.id)!;
            return translatePrimitive(rotatePrimitive(p,s.rotation),s.translationX,s.translationY);
        });
        assert.equal(legalBlockCandidate(input,ps,createClearanceResolver(input)),true);
        assert.ok(blockQuality(input,ps).links['R13.2->U4']<3);
    }
    assert.ok(gpu.solution.rank.score<=cpu.solution.rank.score*1.01+.02);
});

test('live GPU evaluates authored pin/all clearance and layer terms without changing proposals',{
    skip:process.env.PCB_BLOCK_GPU_TEST!=='1',
},()=>{
    const {input,primitives}=fixture();
    input.hints.push(
        {relation:'clearance',source:{type:'pin',designator:'U4',pin_number:'1'},target:{type:'component',designator:'R13'},min:.1,priority:'normal'},
        {relation:'clearance',source:{type:'component',designator:'R13'},target:'all',min:0,priority:'normal'},
        {relation:'prefer_layer',source:{type:'component',designator:'R13'},layer:'bottom',priority:'high'},
        {relation:'same_side',source:{type:'component',designator:'R13'},target:{type:'component',designator:'U4'},priority:'high'},
    );
    const p=problem(input,primitives),gpu=solve(p,'cubecl');
    assert.doesNotMatch(gpu.log,/block-gpu-fallback/);
    assert.match(gpu.log,/"backend":"cubecl"/);
    assert.equal(gpu.solution.rank.hardCount,0);
    const ps=primitives.map(p=>{
        const s=gpu.solution.states.find(s=>s.primitiveId===p.id)!;
        return translatePrimitive(rotatePrimitive(p,s.rotation),s.translationX,s.translationY);
    });
    assert.equal(legalBlockCandidate(input,ps,createClearanceResolver(input)),true);
    const checkpoint=blockQuality(input,ps).score;
    assert.ok(Math.abs(gpu.solution.rank.score-checkpoint)<Math.max(.1,checkpoint*.0002),`${gpu.solution.rank.score} versus checkpoint ${checkpoint}`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { minimalProblem } from './helpers/native-board-problem.ts';
import { loadNativeBoardPacker } from '../src/pcb-layout/pcb-auto-place-v2/native/load-native-board-packer.ts';
import type { NativeBlockSolveProblemV4, NativePostPlaceScoreProblemV1 } from '../src/pcb-layout/pcb-auto-place-v2/native/contract.ts';

const addon = loadNativeBoardPacker();
const close = (a: number, b: number) => assert.ok(Math.abs(a-b)<.02, `${a} != ${b}`);
const emptyPost = (): NativePostPlaceScoreProblemV1 => ({version:1,nets:[],distances:[],clearances:[],edges:[],paths:[],fixedPenalties:[]});
function fixture(distance: number) {
    const board = minimalProblem();
    board.bounds = board.fullBoardBounds = {left:-50,right:50,top:-50,bottom:50};
    board.boardOutline = [{x:-50,y:-50},{x:50,y:-50},{x:50,y:50},{x:-50,y:50}];
    board.primitives = ['A','B'].map((id,i) => {
        const p = structuredClone(board.primitives[0]);
        const x = i*distance;
        return {...p,id,sourceNodeId:`tree:block:${id}`,sourceNodeIds:[`tree:block:${id}`],locked:true,canRotate:false,
            allowedOrientations:[0],bbox:{left:x-.5,right:x+.5,top:-.5,bottom:.5},width:1,height:1,
            collisionBoxes:[{left:x-.5,right:x+.5,top:-.5,bottom:.5}],
            placements:[{designator:id,x,y:0,rotate:0,layer:'top' as const,score:0}],
            connectionPoints:[{ref:`${id}.1`,net:'',x:x+(i?-.3:.3),y:0}]};
    });
    board.components=board.primitives.map(p=>({...board.components[0],designator:p.id,primitiveId:p.id,bodyBox:p.bbox}));
    board.componentPairClearance=[0,.2,.2,0];board.componentConflict=[0,1,1,0];
    const block: NativeBlockSolveProblemV4 = {version:4,grid:.5,clearance:.2,searchWidth:1,compactness:'normal',
        collisionMode:'components',hardCollisionMode:'components',candidateBoxMode:'bbox',primitives:board.primitives,
        components:board.components.map(c=>({...c,pinCount:1,powerComponent:false,role:'passive'})),
        componentPairClearance:board.componentPairClearance,componentConflict:board.componentConflict,relations:[],obstacles:[]};
    return {board,block};
}

test('same component relation costs the same in block, board and PostPlace; compactness cannot rescale it',()=>{
    for(const compactness of ['normal','high'] as const) for(const distance of [2,8,8.5,12,20]) {
        const {board,block}=fixture(distance);board.compactness=block.compactness=compactness;
        const beforeBlock=addon.evaluateBlockQuality(block).score;
        const beforeBoard=addon.evaluateBoardQuality(board).rank.score;
        const relation={id:'test',kind:'hint',relation:'near',from:'component:A',to:'component:B',effect:'score_only',priority:'critical',weight:240,hard:false,satelliteAnchor:false,preferFacingPads:false};
        board.relations=[relation];block.relations=[relation];
        const profile=addon.placementRelationProfile({relation:'near',priority:'critical',weight:240});
        const post=emptyPost();post.distances=[{source:{x:0,y:0},target:{x:distance,y:0},...profile}];
        const expected=addon.scorePostPlace(post);
        close(addon.evaluateBlockQuality(block).score-beforeBlock,expected);
        close(addon.evaluateBoardQuality(board).rank.score-beforeBoard,expected);
    }
});

test('authored weight, legacy defaults, stronger path curve and no saturation',()=>{
    const near=addon.placementRelationProfile({relation:'near',priority:'normal'});
    assert.equal(near.max,12);assert.equal(near.min,.800000011920929);
    const pair=addon.placementRelationProfile({relation:'critical_pair',priority:'critical',weight:240,maxDistance:9});
    const path=addon.placementRelationProfile({relation:'critical_pair',priority:'critical',weight:240,maxDistance:9,path:true});
    assert.equal(pair.weight,40);assert.equal(path.weight,80);assert.equal(pair.inverseTauSquared,1);
    assert.equal(addon.placementRelationProfile({relation:'critical_pair',priority:'critical',path:true}).max,undefined);
    const score=(d:number,p=pair)=>addon.scorePostPlace({...emptyPost(),distances:[{source:{x:0,y:0},target:{x:d,y:0},...p}]});
    assert.equal(score(9.5),385);assert.equal(score(9.5,path),770);
    assert.ok(score(40)>250000);assert.ok(score(41)>score(40));
});

test('core island uses each pair profile without its former 10000 multiplier',()=>{
    const {board}=fixture(9.5);
    const island={corePairs:true,bbox:board.bounds,overlap:false,origin:{x:0,y:0},centerPowerBus:false,
        points:board.primitives.map(p=>({reference:`${p.id}.1`,owner:p.id,point:{x:p.placements[0].x,y:0},center:{x:p.placements[0].x,y:0},layer:'top'})),
        pads:[],pairs:[['A.1','B.1']] as Array<[string,string]>,
        pairRelations:[{relation:'critical_pair',priority:'critical',weight:240,maxDistance:9}]};
    const a=addon.scoreIslandQuality(island);
    island.pairRelations[0].weight=480;
    close(addon.scoreIslandQuality(island)-a,385);
});

test('critical/core/path profiles and authored multipliers agree across the three stages',()=>{
    for (const request of [
        {relation:'critical_pair',priority:'high',weight:140,core:true},
        {relation:'critical_pair',priority:'high',weight:140,core:true,hard:true},
        {relation:'critical_pair',priority:'critical',weight:480,maxDistance:5},
        {relation:'critical_pair',priority:'high',weight:140,maxDistance:5,path:true},
    ]) for (const distance of [2,4,8]) {
        const {board,block}=fixture(distance);
        const beforeBlock=addon.evaluateBlockQuality(block).score, beforeBoard=addon.evaluateBoardQuality(board).rank.score;
        const relation={id:'pair',kind:'critical_pair',relation:'critical_pair',from:'component:A',to:'component:B',effect:'score_only',
            priority:request.priority,weight:request.weight,maxDistance:request.maxDistance,core:request.core,pathId:request.path?'p':undefined,
            hard:request.hard ?? false,satelliteAnchor:false,preferFacingPads:false};
        board.relations=[relation];block.relations=[relation];
        const profile=addon.placementRelationProfile(request);
        const expected=addon.scorePostPlace({...emptyPost(),distances:[{source:{x:0,y:0},target:{x:distance,y:0},...profile}]});
        close(addon.evaluateBlockQuality(block).score-beforeBlock,expected);
        close(addon.evaluateBoardQuality(board).rank.score-beforeBoard,expected);
    }
});

test('core DSL helpers preserve authored weight without injecting a hidden multiplier', async()=>{
    const {runPcbLayoutDsl}=await import('../src/pcb-layout/pcb-layout-dsl/spec.ts');
    const rules=runPcbLayoutDsl(`
        criticalPair(pin("U1","1"), pin("L1","1"), {priority:"critical",maxDistance:3});
        corePairs("core", [[pin("U1","1"),pin("L1","1")]]);
        coreIsland("island", ["U1","L1"], {pairs:[[pin("U1","1"),pin("L1","1")]],weight:2});
    `);
    const pairs=rules.hints.filter(h=>h.relation==='critical_pair');
    assert.equal(pairs.length,3);
    assert.equal(pairs[0].weightMultiplier,null);
    assert.equal(pairs[1].weightMultiplier,null);
    assert.equal(pairs[2].weightMultiplier,2);
});

test('core hard distance allows drift with x100 excess cost and reports it',()=>{
    const island={corePairs:true,bbox:{left:0,right:4,top:0,bottom:1},overlap:false,origin:{x:0,y:0},centerPowerBus:false,
        points:[0,4].map((x,i)=>({reference:`P${i}.1`,owner:`P${i}`,point:{x,y:0},center:{x,y:0},layer:'top'})),
        pads:[],pairs:[['P0.1','P1.1']] as Array<[string,string]>,
        pairRelations:[{relation:'critical_pair',priority:'critical',weight:.001,minDistance:1,maxDistance:2,hard:true,core:true}]};
    const hard=addon.evaluateIslandQuality(island);
    assert.equal(hard.hardCount,0);assert.equal(hard.hardSeverity,0);
    assert.deepEqual(hard.distanceDrifts,[{pair:['P0.1','P1.1'],distance:4,min:1,max:2}]);
    island.pairRelations[0].hard=false;
    const soft=addon.evaluateIslandQuality(island);
    assert.equal(soft.hardCount,0);assert.deepEqual(soft.distanceDrifts,[]);
    assert.ok(Math.abs(hard.score-soft.score - (40*.001/240)*8*99)<.0001);
    island.pairRelations[0].hard=true;island.points[1].point.x=1.5;
    const within=addon.evaluateIslandQuality(island);
    assert.equal(within.hardCount,0);assert.deepEqual(within.distanceDrifts,[]);
    island.pairRelations[0].hard=false;
    assert.equal(addon.evaluateIslandQuality(island).score,within.score);
    island.pairRelations[0].hard=true;
    island.points[1].point.x=.5;
    assert.equal(addon.evaluateIslandQuality(island).distanceDrifts.length,1);
    island.overlap=true;
    assert.equal(addon.evaluateIslandQuality(island).hardCount,1);
});
import { expandHints } from '../src/pcb-layout/pcb-auto-place/hints.ts';
import type { PlacementInput } from '../src/types/pcb/layout-model.ts';

test('critical priority is a distance objective; only authored non-core hard limits veto admission', () => {
    const pair = {relation:'critical_pair',source:{type:'pin',designator:'A',pin_number:'1'},target:{type:'pin',designator:'B',pin_number:'1'},priority:'critical',maxDistance:5};
    const input = {hints:[pair,{...pair,hard:true},{...pair,hard:false},{...pair,hard:true,core:true},
        {relation:'very_near',source:pair.source,target:pair.target,priority:'critical'}]} as unknown as PlacementInput;
    const rules=expandHints(input);
    assert.deepEqual(rules.map(r=>r.hard),[false,true,false,false,false]);
    assert.equal(rules[0].max,5);
    assert.equal(rules[4].max,3);
    assert.equal(rules[3].inverseTauSquared,100);
});

test('row obstruction uses the same native cost in block, board and PostPlace',()=>{
    const {board,block}=fixture(3);
    const beforeBlock=addon.evaluateBlockQuality(block).score;
    const beforeBoard=addon.evaluateBoardQuality(board).rank.score;
    const rows=[{box:{left:1,right:4,top:-1,bottom:1},weight:360}];
    board.components[0].accessRows=rows;
    block.components[0].accessRows=rows;
    const post=emptyPost();post.accessComponents=board.components.map(c=>({body:c.bodyBox,layer:c.layer,rows:c.accessRows??[]}));
    const expected=addon.scorePostPlace(post);
    assert.ok(expected>0);
    close(addon.evaluateBlockQuality(block).score-beforeBlock,expected);
    close(addon.evaluateBoardQuality(board).rank.score-beforeBoard,expected);
    post.accessComponents[1].layer='bottom';assert.equal(addon.scorePostPlace(post),0);
});

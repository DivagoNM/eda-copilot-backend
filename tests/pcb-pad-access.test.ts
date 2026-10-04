import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {componentAccessProfile,componentAccessRows} from '../src/pcb-layout/pcb-auto-place-v2/native/pad-access.ts';
import {componentPairClearance} from '../src/pcb-layout/pcb-auto-place/report-helpers.ts';
import type {PlacementInput} from '../src/types/pcb/layout-model.ts';
const input:PlacementInput=JSON.parse(readFileSync(new URL('./fixtures/block-placement/ESPower/input.json',import.meta.url),'utf8'));
test('real MCU and USB get pad-row access; connector is no longer exempt',()=>{
 for(const ref of ['U1','U12']){
  const c=input.components.find(c=>c.designator===ref)!;const p=componentAccessProfile(c);
  assert.ok(p.rows.length>0 && p.rows.length<=4,ref);
  assert.ok(p.rows.every(r=>r.weight>0));
  assert.ok(p.minimumExtra>0);
  const r=input.components.find(c=>c.designator==='R12')!;
  assert.ok(componentPairClearance(input,c,r)>input.board.clearances.component);
  const a=componentAccessRows(c,{designator:ref,x:0,y:0,rotate:0,layer:'top',score:0});
  const b=componentAccessRows(c,{designator:ref,x:10,y:20,rotate:90,layer:'top',score:0});
  assert.deepEqual(a.map(r=>r.weight),b.map(r=>r.weight));
  for(let i=0;i<a.length;i++){const x=a[i].box,y=b[i].box;assert.ok(Math.abs((x.right-x.left)-(y.bottom-y.top))<0.001);assert.ok(Math.abs((x.bottom-x.top)-(y.right-y.left))<0.001);}
 }
});

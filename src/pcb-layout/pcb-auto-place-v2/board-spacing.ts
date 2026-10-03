import { loadNativeBoardPacker } from './native/load-native-board-packer.ts';
import { encodeBoardQualityProblem } from './native/evaluate-board-quality.ts';
import * as fp from '../f32.ts';
import type { Box, PlacementInput, TargetRef } from '#types/pcb/layout-model.ts';
import { componentBodyBox, componentCollisionBoxes, boardHoleKeepoutRadius, pointInBoard } from '../pcb-auto-place/geometry.ts';
import type { PlacementPrimitive } from './primitives.ts';

export function boardSpacingExemptPairs(input: PlacementInput, roots: PlacementPrimitive[]): Array<[string,string]> {
    const members = (target: TargetRef | undefined): string[] => !target ? [] : target.type==='block'
        ? input.blocks.find(b=>b.name===target.block_name)?.component_designators ?? []
        : 'designator' in target ? [target.designator] : [];
    const links: Array<[string[],string[]]> = input.blocks.filter(b=>b.attachTo).map(b=>[
        b.component_designators, input.blocks.find(p=>p.name===b.attachTo)?.component_designators ?? []]);
    for(const b of input.blocks) if(b.anchor)links.push([b.component_designators,members(b.anchor)]);
    for(const h of input.hints) if((h.relation==='near'||h.relation==='critical_pair') &&
        (('hard' in h && h.hard)||h.priority==='high'||h.priority==='critical')) links.push([members(h.source),members(h.target)]);
    const result:Array<[string,string]>=[];
    const owns=(p:PlacementPrimitive,refs:string[])=>p.placements.some(q=>refs.includes(q.designator));
    for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++)
        if(links.some(([a,b])=>owns(roots[i],a)&&owns(roots[j],b)||owns(roots[i],b)&&owns(roots[j],a))) result.push([roots[i].id,roots[j].id]);
    return result;
}

/** Bounded comfort margin. Density uses the complete inventory, never a partial
 * beam state; changing order or translating a block cannot change this budget. */
export function boardSpacingPolicy(input: PlacementInput) {
    const {width,height} = input.board.outline;
    const area=(b:Box)=>fp.mul((fp.add(fp.sub(b.right, b.left), input.board.clearances.component)), (fp.add(fp.sub(b.bottom, b.top), input.board.clearances.component)));
    const occupied = input.components.reduce((sum,c)=> {
        const pose={designator:c.designator,x:0,y:0,rotate:c.pcb.fixedPlacement?.rotate ?? 0,
            layer:c.pcb.fixedPlacement?.layer ?? c.pcb.allowedLayers[0] ?? 'top',score:0};
        return fp.add(sum, input.board.allowedLayers.reduce((sideSum,layer)=>fp.add(sideSum, (layer===pose.layer
            ? area(componentBodyBox(c,pose))
            : componentCollisionBoxes(c,pose,layer).reduce((boxSum,box)=>fp.add(boxSum, area(box)),0))),0));
    },0);
    let usable=0;
    const samples=64;
    for(const layer of input.board.allowedLayers) for(let x=0;x<samples;x++) for(let y=0;y<samples;y++) {
        const p={x:fp.add(fp.div(-width, 2), fp.div(fp.mul((fp.add(x, .5)), width), samples)),y:fp.add(fp.div(-height, 2), fp.div(fp.mul((fp.add(y, .5)), height), samples))};
        if(!pointInBoard(input.board,p,input.board.clearances.edge)) continue;
        if((input.boardHoles ?? []).some(h=>fp.hypot(fp.sub(p.x, h.x), fp.sub(p.y, h.y))<boardHoleKeepoutRadius(h))) continue;
        if((input.constraintRegions ?? []).some(r=>r.layers.includes(layer)&&p.x>=r.box.left&&p.x<=r.box.right&&p.y>=r.box.top&&p.y<=r.box.bottom)) continue;
        usable++;
    }
    return loadNativeBoardPacker().placementSpacingPolicy([occupied, fp.div(fp.mul(fp.mul(usable, width), height), fp.mul(samples, samples))]);
}

/** Same pair penalty as the native board objective. No reward beyond the gap. */
export function boardSpacingPenalty(input: PlacementInput, roots: PlacementPrimitive[], gap=boardSpacingPolicy(input).gap) {
    return loadNativeBoardPacker().scoreBoardSpacing(encodeBoardQualityProblem(input, roots, undefined, undefined, gap, true));
}

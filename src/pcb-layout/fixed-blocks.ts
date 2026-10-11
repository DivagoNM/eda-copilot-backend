import type { PlacementRules } from '#types/pcb/layout-rules.ts';
import type { Placement, PlacementInput } from '#types/pcb/layout-model.ts';
import { familyBlockDesignators } from './pcb-auto-place/report-helpers.ts';
import { coordinateDifference } from './coordinate-transport.ts';
import { rotatePrimitive, translatePrimitive, type PlacementPrimitive } from './pcb-auto-place-v2/primitives.ts';
import { primitiveInFrame } from './pcb-auto-place-v2/native/numeric-frame.ts';

export function validateFixedBlocks(rules: PlacementRules) {
    for (const block of rules.blocks) {
        if (!block.fixed) continue;
        const fail = (message: string): never => { throw new Error(`block("${block.name}").fixed: ${message}`); };
        if (block.attachTo || block.placement === 'satellite') fail('only root blocks can be fixed.');
        const family = new Set([block.name]);
        for (let size = -1; size !== family.size;) {
            size = family.size;
            for (const child of rules.blocks) if (child.attachTo && family.has(child.attachTo)) family.add(child.name);
        }
        if (rules.modules.some(m => m.block_names.some(name => family.has(name)))) fail('fixed families cannot belong to a module.');
        const direct = new Set([...block.component_designators, ...rules.component_rules.filter(c => c.block_name === block.name).map(c => c.designator)]);
        if (!direct.has(block.fixed.reference)) fail('reference must be a direct member of this block.');
        const members = new Set(rules.blocks.filter(b => family.has(b.name)).flatMap(b => b.component_designators));
        for (const c of rules.component_rules) if (c.block_name && family.has(c.block_name)) members.add(c.designator);
        for (const c of rules.component_rules) if (members.has(c.designator) && (c.fixedPlacement || c.edgeMount || c.edgePlace)) {
            fail(`${c.designator} already uses fixed(), edgeMount() or edgePlace().`);
        }
        if ((rules.boardPads ?? []).some(p => members.has(p.name) || (p.block && family.has(p.block)))) fail('fixed board pads cannot be moved with a block.');
        if (Array.isArray(rules.preserve?.components) && rules.preserve.components.some(d => members.has(d))) fail('preserved components cannot be moved with a block.');
    }
}

function fixedBlockOwners(input: PlacementInput) {
    return new Map(input.blocks.filter(b => b.fixed).flatMap(b => familyBlockDesignators(input, b).map(d => [d, b.name] as const)));
}

/** Check actual preserved/synthetic poses after resolving input, before any search. */
export function validateResolvedFixedBlocks(input: PlacementInput) {
    const owners = fixedBlockOwners(input);
    for (const c of input.components) {
        if (owners.has(c.designator) && (c.pcb.fixedPlacement || c.pcb.edgeMount || c.pcb.edgePlace)) {
            throw new Error(`Fixed block ${owners.get(c.designator)}: ${c.designator} has an independently fixed or preserved pose.`);
        }
    }
}

/** Freeze only AFTER the complete ordinary local solve, including satellite search. */
export function fixSolvedBlock(input: PlacementInput, primitive: PlacementPrimitive): PlacementPrimitive {
    const fixed = input.blocks.find(b => b.name === primitive.label)?.fixed;
    if (primitive.kind !== 'block' || !fixed) return primitive;
    const reference = primitive.placements.find(p => p.designator === fixed.reference);
    if (!reference) throw new Error(`Fixed block ${primitive.label}: missing reference ${fixed.reference}`);
    if (primitive.placements.some(p => input.components.find(c => c.designator === p.designator)?.pcb.fixedPlacement)) {
        throw new Error(`Fixed block ${primitive.label} contains an independently fixed component.`);
    }
    const rotated = rotatePrimitive(primitive, (fixed.rotate - reference.rotate + 360) % 360);
    const rotatedReference = rotated.placements.find(p => p.designator === fixed.reference)!;
    const local = translatePrimitive(rotated, coordinateDifference(0, rotatedReference.x), coordinateDifference(0, rotatedReference.y));
    // Restore the authored absolute point at the transport boundary, without narrowing it.
    const placed = primitiveInFrame(local, { x: fixed.x, y: fixed.y }, true);
    for (const pose of placed.placements) {
        const component = input.components.find(c => c.designator === pose.designator)!;
        if (!component.pcb.allowedRotations.includes(pose.rotate) || !component.pcb.allowedLayers.includes(pose.layer)) {
            throw new Error(`Fixed block ${primitive.label}: ${pose.designator} has a disallowed final orientation or layer.`);
        }
    }
    const freeze = (p: PlacementPrimitive): PlacementPrimitive => ({ ...p,
        locked: true, anchored: false, canRotate: false, allowedOrientations: [0],
        layoutAlternatives: undefined, children: p.children.map(freeze),
    });
    return freeze(placed);
}

/** Derived poses are runtime state, never authored component.fixed rules. */
export function withFixedBlockPlacements(input: PlacementInput, placements: Placement[]): PlacementInput {
    const owners = fixedBlockOwners(input);
    if (!owners.size) return input;
    const poses = new Map(placements.map(p => [p.designator, p]));
    return { ...input, components: input.components.map(c => {
        if (!owners.has(c.designator)) return c;
        const pose = poses.get(c.designator);
        if (!pose) throw new Error(`Fixed block ${owners.get(c.designator)}: missing ${c.designator}`);
        return { ...c, pcb: { ...c.pcb, fixedBlock: owners.get(c.designator),
            fixedPlacement: { x: pose.x, y: pose.y, rotate: pose.rotate, layer: pose.layer } } };
    }) };
}

export function assertFixedBlockPlacements(input: PlacementInput, placements: Placement[]) {
    const poses = new Map(placements.map(p => [p.designator, p]));
    for (const c of input.components) {
        if (!c.pcb.fixedBlock) continue;
        const expected = c.pcb.fixedPlacement!;
        const actual = poses.get(c.designator);
        if (!actual || actual.x !== expected.x || actual.y !== expected.y || actual.rotate !== expected.rotate || actual.layer !== expected.layer) {
            throw new Error(`Fixed block ${c.pcb.fixedBlock}: ${c.designator} moved after locking.`);
        }
    }
}

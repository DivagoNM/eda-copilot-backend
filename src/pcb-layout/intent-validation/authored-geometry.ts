import type { FootprintSpec } from '../../types/pcb/layout-model.ts';
import type { PlacementRules } from '../../types/pcb/layout-rules.ts';
import type { LocalLayout } from '../pcb-auto-place-v2/local-layout.ts';
import { getLocalPointOffset, normalizeRotation } from '../pcb-auto-place/geometry.ts';
import { coordinateDifference } from '../coordinate-transport.ts';
import * as fp from '../f32.ts';
import type { CircuitPatternRequirement, CircuitPinRef } from './recognition/types.ts';
import { stableCompare } from './recognition/context.ts';

type Pose = { x: number; y: number; rotate: number; layer: 'top' | 'bottom' };
/** Authored poses only. These measurements are neither native scores nor routed lengths. */
export function createAuthoredGeometry(rules: PlacementRules, layouts: Map<string, LocalLayout>, footprints?: Record<string, FootprintSpec>) {
    function posesFor(designators: string[], requireLayers: boolean): Map<string, Pose> | undefined {
        const local = [...layouts.entries()].sort(([a], [b]) => stableCompare(a, b)).find(([, layout]) => designators.every(d => layout[d]));
        const poses = new Map<string, Pose>();
        for (const name of designators) {
            const rule = rules.component_rules.find(r => r.designator === name);
            const seed = local?.[1][name];
            const fixed = rule?.fixedPlacement;
            if (seed) {
                // Independent per-component side choices do not establish a pad span.
                if (requireLayers && rule?.allowedLayers?.length !== 1) return undefined;
                poses.set(name, { x: seed.x, y: seed.y, rotate: normalizeRotation(seed.rotate ?? 0), layer: rule?.allowedLayers?.[0] ?? 'top' });
            } else if (fixed && !fixed.anchor && fixed.x != null && fixed.y != null && (!requireLayers || fixed.layer)) {
                poses.set(name, { x: fixed.x, y: fixed.y, rotate: normalizeRotation(fixed.rotate ?? 0), layer: fixed.layer ?? 'top' });
            } else return undefined;
        }
        return poses;
    }
    function offset(pin: CircuitPinRef, pose: Pose) {
        const pads = footprints?.[pin.designator]?.pads.filter(p => String(p.pin_number) === String(pin.pin_number));
        if (!pads || pads.length !== 1) return undefined;
        return getLocalPointOffset(pads[0], pose.rotate, pose.layer);
    }
    function status(requirement: Extract<CircuitPatternRequirement, { relation: 'balanced' | 'alignment' }>): 'pad' | 'missing' | 'unavailable' {
        if (requirement.relation === 'balanced' && requirement.ambiguous) return 'unavailable';
        const names = requirement.relation === 'alignment' ? [requirement.source, requirement.target] :
            [...new Set(requirement.branches.flatMap(b => [b.source.designator, b.target.designator]))];
        const poses = posesFor(names, requirement.relation === 'balanced');
        if (!poses) return 'unavailable';
        if (requirement.relation === 'alignment') {
            const a = poses.get(requirement.source)!, b = poses.get(requirement.target)!;
            const dx = fp.abs(fp.sub(coordinateDifference(a.x, b.x), requirement.offset?.x ?? 0));
            const dy = fp.abs(fp.sub(coordinateDifference(a.y, b.y), requirement.offset?.y ?? 0));
            const error = requirement.axis === 'x' ? dx : requirement.axis === 'y' ? dy : fp.max(dx, dy);
            if (!Number.isFinite(error)) return 'unavailable';
            return fp.sub(error, requirement.tolerance) > fp.PCB_PLACEMENT_EPSILON ? 'missing' : 'pad';
        }
        const lengths: number[] = [];
        for (const branch of requirement.branches) {
            const a = poses.get(branch.source.designator)!, b = poses.get(branch.target.designator)!;
            const pa = offset(branch.source, a), pb = offset(branch.target, b);
            if (!pa || !pb) return 'unavailable';
            lengths.push(fp.hypot(fp.add(coordinateDifference(a.x, b.x), fp.sub(pa.x, pb.x)),
                fp.add(coordinateDifference(a.y, b.y), fp.sub(pa.y, pb.y))));
        }
        if (!lengths.every(Number.isFinite)) return 'unavailable';
        return fp.sub(fp.sub(fp.max(...lengths), fp.min(...lengths)), requirement.maxDifference) > fp.PCB_PLACEMENT_EPSILON ? 'missing' : 'pad';
    }
    return { status };
}

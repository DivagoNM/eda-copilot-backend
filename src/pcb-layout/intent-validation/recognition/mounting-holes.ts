import type { CircuitComponent } from './context.ts';
import type { DetectCircuitPatternsInput } from './types.ts';

/** Explicit mechanical labels, never a generic drill, through-hole pad or H prefix. */
export function isMountingHoleComponent(component: CircuitComponent, input: DetectCircuitPatternsInput): boolean {
    const kind = input.knowledge?.components?.[component.designator]?.kind;
    if (kind) return kind === 'mounting-hole';
    if (input.componentRoles?.[component.designator] === 'connector') return false;
    if (/^MH\d+$/i.test(component.designator)) return true;
    return [component.value, component.footprint_name, input.footprints?.[component.designator]?.name].some(name =>
        name && /(?:^|[^a-z])(?:mounting[\s_-]*hole|mount[\s_-]*hole|screw[\s_-]*hole)(?=$|[^a-z])/i.test(name));
}

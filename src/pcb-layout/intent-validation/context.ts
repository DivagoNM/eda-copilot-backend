import type { CircuitPatternMatch, CircuitPatternRequirement, CircuitPinRef } from './recognition/types.ts';
import { pinKey } from './recognition/context.ts';
import type { ExplainCircuit } from '../../types/circuit.ts';
import type { TargetRef, FootprintSpec, ExistingPlacement } from '../../types/pcb/layout-model.ts';
import type { PlacementRules } from '../../types/pcb/layout-rules.ts';
import type { PcbDslCall } from '../pcb-layout-dsl/spec.ts';
import type { LocalLayout } from '../pcb-auto-place-v2/local-layout.ts';
import * as fp from '../f32.ts';
import { createAuthoredGeometry } from './authored-geometry.ts';
import { createConnectorMechanics } from './connector-mechanics.ts';

export function createIntentContext(circuit: ExplainCircuit, rules: PlacementRules, layouts: Map<string, LocalLayout>, calls: PcbDslCall[], footprints?: Record<string, FootprintSpec>, existingPlacement?: ExistingPlacement) {
    const geometry = createAuthoredGeometry(rules, layouts, footprints);
    const connectorPlacementWarning = createConnectorMechanics(rules, footprints, existingPlacement);
    const byDesignator = new Map(circuit.components.map(c => [c.designator, c]));
    const blocks = new Map(rules.blocks.map(b => [b.name, new Set(b.component_designators)]));
    for (const rule of rules.component_rules) if (rule.block_name) blocks.get(rule.block_name)?.add(rule.designator);
    const covers = (target: TargetRef | 'all', designator: string) => target === 'all' ||
        (target.type === 'component' || target.type === 'pin' ? target.designator === designator :
            target.type === 'block' ? blocks.get(target.block_name)?.has(designator) ?? false : false);
    const samePin = (a: CircuitPinRef, b: CircuitPinRef) => pinKey(a.designator, a.pin_number) === pinKey(b.designator, b.pin_number);
    const strong = (priority: string, hard?: boolean | null) => priority === 'high' || priority === 'critical' || hard === true;
    const seededTogether = (a: string, b: string) => [...layouts.values()].some(l => l[a] && l[b]);
    function locality(source: CircuitPinRef, target: CircuitPinRef, minimumPriority?: 'high' | 'critical'): 'pad' | 'seed' | 'weak' | 'missing' {
        const adequate = (priority: string, hard?: boolean | null) => minimumPriority === 'critical' ? priority === 'critical' : strong(priority, hard);
        const net = byDesignator.get(source.designator)?.pins.find(p => String(p.pin_number) === String(source.pin_number))?.signal_name;
        const targetNet = byDesignator.get(target.designator)?.pins.find(p => String(p.pin_number) === String(target.pin_number))?.signal_name;
        const segments = [...rules.paths.flatMap(p => p.segments), ...rules.hints.filter(h => h.relation === 'critical_pair')];
        if (segments.some(h => adequate(h.priority, h.hard) &&
            ((samePin(h.source, source) && samePin(h.target, target)) || (samePin(h.source, target) && samePin(h.target, source))))) return 'pad';
        for (const hint of rules.hints) {
            if (hint.relation === 'bypass' || hint.relation === 'cap_cluster') {
                if (hint.target && adequate(hint.priority) && net && net === targetNet &&
                    ((hint.capacitors.includes(source.designator) && samePin(hint.target, target)) ||
                     (hint.capacitors.includes(target.designator) && samePin(hint.target, source)))) return 'pad';
            } else if (hint.relation === 'near' || hint.relation === 'very_near' || hint.relation === 'cluster_with') {
                if (hint.source.type === 'pin' && hint.target.type === 'pin' && adequate(hint.priority) &&
                    ((samePin(hint.source, source) && samePin(hint.target, target)) ||
                     (samePin(hint.source, target) && samePin(hint.target, source)))) return 'pad';
            }
        }
        if (seededTogether(source.designator, target.designator)) return minimumPriority === 'critical' ? 'weak' : 'seed';
        const a = source, b = target;
        const weak = rules.hints.some(h => (h.relation === 'near' || h.relation === 'very_near' || h.relation === 'cluster_with') &&
            ((covers(h.source, a.designator) && covers(h.target, b.designator)) ||
             (covers(h.source, b.designator) && covers(h.target, a.designator)))) ||
            segments.some(h => covers(h.source, source.designator) && covers(h.target, target.designator) ||
                covers(h.target, source.designator) && covers(h.source, target.designator));
        return weak ? 'weak' : 'missing';
    }
    function requirementStatus(requirement: CircuitPatternRequirement) {
        if (requirement.relation === 'connector-placement') return connectorPlacementWarning(requirement.source, requirement.maxEdgeDistance) ? 'missing' : 'pad';
        if (requirement.relation === 'balanced' || requirement.relation === 'alignment') return geometry.status(requirement);
        if (requirement.relation === 'local') {
            const statuses = [requirement, ...(requirement.alternatives ?? [])].map(r => locality(r.source, r.target, requirement.minimumPriority));
            return statuses.includes('pad') ? 'pad' : statuses.includes('seed') ? 'seed' : statuses.includes('weak') ? 'weak' : 'missing';
        }
        if (requirement.relation === 'supply-group') {
            const statuses = requirement.targets.flatMap(target => requirement.capacitors.map(source => locality(source, target)));
            return statuses.includes('pad') ? 'pad' : statuses.includes('seed') ? 'seed' : statuses.includes('weak') ? 'weak' : 'missing';
        }
        if (requirement.relation === 'edge') {
            const component = rules.component_rules.find(c => c.designator === requirement.source);
            if (component?.edgeMount?.edge === requirement.edge || component?.edgePlace?.edges.includes(requirement.edge)) return 'pad';
            return rules.hints.some(h => h.relation === 'edge' && h.edge === requirement.edge && covers(h.source, requirement.source)) ? 'pad' : 'missing';
        }
        if (requirement.relation === 'rotation') {
            const component = rules.component_rules.find(c => c.designator === requirement.source);
            const rotations = component?.fixedPlacement?.rotate != null ? [component.fixedPlacement.rotate] : component?.allowedRotations;
            const normalized = (angle: number) => ((angle % 360) + 360) % 360;
            return rotations?.length && rotations.every(r => requirement.allowed.includes(normalized(r))) ? 'pad' : 'missing';
        }
        if (requirement.relation === 'separate-group') return seededTogether(requirement.source, requirement.target) ? 'missing' : 'pad';
        if (requirement.relation === 'keepout') {
            const region = rules.constraintRegions.find(r => r.name === requirement.region);
            if (!region || requirement.minimumWidth !== undefined && fp.f32(region.shape.width) < fp.f32(requirement.minimumWidth) ||
                requirement.minimumHeight !== undefined && fp.f32(region.shape.height) < fp.f32(requirement.minimumHeight) ||
                requirement.layers?.some(layer => !region.layers.includes(layer)) ||
                region.allow.blocks.some(block => !(requirement.allowBlocks ?? []).includes(block))) return 'missing';
            return 'pad';
        }
        const expected = requirement.relation === 'near' ? ['near', 'very_near', 'cluster_with'] : ['away_from', 'clearance'];
        return rules.hints.some(h => {
            if (!('source' in h) || !('target' in h) || !expected.includes(h.relation)) return false;
            // clearance(group, all) excludes the source group in the real solver.
            if (h.relation === 'clearance' && h.target === 'all' &&
                covers(h.source, requirement.source) && covers(h.source, requirement.target)) return false;
            if (!((covers(h.source, requirement.source) && covers(h.target, requirement.target)) ||
                (covers(h.source, requirement.target) && covers(h.target, requirement.source)))) return false;
            if (requirement.relation === 'away' && requirement.minDistance !== undefined)
                return h.relation === 'clearance' && fp.f32(h.min) >= fp.f32(requirement.minDistance);
            return true;
        }) ? 'pad' : seededTogether(requirement.source, requirement.target) && requirement.relation === 'near' ? 'seed' : 'missing';
    }
    function locationsFor(match: CircuitPatternMatch) {
        const known = new Set(match.components);
        const locations = calls.filter(call => call.args.some(arg => references(arg, known))).map(({ line, column }) => ({ line, column }));
        return [...new Map(locations.map(l => [JSON.stringify(l), l])).values()].sort((a, b) => a.line - b.line || a.column - b.column);
    }
    return { circuit, rules, layouts, calls, locality, requirementStatus, locationsFor, connectorPlacementWarning };
}
function references(value: unknown, components: Set<string>, depth = 0): boolean {
    if (typeof value === 'string') return components.has(value);
    if (!value || typeof value !== 'object' || depth > 5) return false;
    return Object.entries(value).some(([key, item]) => components.has(key) || references(item, components, depth + 1));
}
export type PcbIntentContext = ReturnType<typeof createIntentContext>;

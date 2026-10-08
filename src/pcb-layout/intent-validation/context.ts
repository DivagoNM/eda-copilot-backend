import type { CircuitPatternRequirement, CircuitPinRef } from './recognition/types.ts';
import { pinKey, type CircuitPatternContext } from './recognition/context.ts';
import type { ExplainCircuit } from '../../types/circuit.ts';
import type { TargetRef, ExistingPlacement } from '../../types/pcb/layout-model.ts';
import type { PlacementRules } from '../../types/pcb/layout-rules.ts';
import type { LocalLayout } from '../pcb-auto-place-v2/local-layout.ts';
import { isMountingHoleComponent } from './recognition/mounting-holes.ts';
import { createConnectorMechanics } from './connector-mechanics.ts';

export function createIntentContext(recognition: CircuitPatternContext, rules: PlacementRules, layouts: Map<string, LocalLayout>, fullCircuit: ExplainCircuit, existingPlacement?: ExistingPlacement) {
    const { circuit, footprints, byDesignator } = recognition;
    const connectorPlacementWarning = createConnectorMechanics(rules, footprints, existingPlacement);
    const mountingHoleCount = rules.boardHoles.length + fullCircuit.components.filter(c => isMountingHoleComponent(c, recognition)).length;
    const blocks = new Map(rules.blocks.map(b => [b.name, new Set(b.component_designators)]));
    for (const rule of rules.component_rules) if (rule.block_name) blocks.get(rule.block_name)?.add(rule.designator);
    const covers = (target: TargetRef | 'all', designator: string) => target === 'all' ||
        (target.type === 'component' || target.type === 'pin' ? target.designator === designator :
            target.type === 'block' ? blocks.get(target.block_name)?.has(designator) ?? false : false);
    const samePin = (a: CircuitPinRef, b: CircuitPinRef) => pinKey(a.designator, a.pin_number) === pinKey(b.designator, b.pin_number);
    const strong = (priority: string, hard?: boolean | null) => priority === 'high' || priority === 'critical' || hard === true;
    const seededTogether = (a: string, b: string) => [...layouts.values()].some(l => l[a] && l[b]);
    function locality(source: CircuitPinRef, target: CircuitPinRef): 'pad' | 'seed' | 'weak' | 'missing' {
        const net = byDesignator.get(source.designator)?.pins.find(p => String(p.pin_number) === String(source.pin_number))?.signal_name;
        const targetNet = byDesignator.get(target.designator)?.pins.find(p => String(p.pin_number) === String(target.pin_number))?.signal_name;
        const segments = [...rules.paths.flatMap(p => p.segments), ...rules.hints.filter(h => h.relation === 'critical_pair')];
        if (segments.some(h => strong(h.priority, h.hard) &&
            ((samePin(h.source, source) && samePin(h.target, target)) || (samePin(h.source, target) && samePin(h.target, source))))) return 'pad';
        for (const hint of rules.hints) {
            if (hint.relation === 'bypass' || hint.relation === 'cap_cluster') {
                if (hint.target && strong(hint.priority) && net && net === targetNet &&
                    ((hint.capacitors.includes(source.designator) && samePin(hint.target, target)) ||
                     (hint.capacitors.includes(target.designator) && samePin(hint.target, source)))) return 'pad';
            } else if (hint.relation === 'near' || hint.relation === 'very_near' || hint.relation === 'cluster_with') {
                if (hint.source.type === 'pin' && hint.target.type === 'pin' && strong(hint.priority) &&
                    ((samePin(hint.source, source) && samePin(hint.target, target)) ||
                     (samePin(hint.source, target) && samePin(hint.target, source)))) return 'pad';
            }
        }
        if (seededTogether(source.designator, target.designator)) return 'seed';
        const a = source, b = target;
        const weak = rules.hints.some(h => (h.relation === 'near' || h.relation === 'very_near' || h.relation === 'cluster_with') &&
            ((covers(h.source, a.designator) && covers(h.target, b.designator)) ||
             (covers(h.source, b.designator) && covers(h.target, a.designator)))) ||
            segments.some(h => covers(h.source, source.designator) && covers(h.target, target.designator) ||
                covers(h.target, source.designator) && covers(h.source, target.designator));
        return weak ? 'weak' : 'missing';
    }
    function requirementStatus(requirement: CircuitPatternRequirement) {
        if (requirement.relation === 'mounting-holes') return mountingHoleCount >= requirement.minimumCount ? 'pad' : 'missing';
        if (requirement.relation === 'connector-placement') return connectorPlacementWarning(requirement.source, requirement.maxEdgeDistance) ? 'missing' : 'pad';
        if (requirement.relation === 'local') {
            const statuses = [requirement, ...(requirement.alternatives ?? [])].map(r => locality(r.source, r.target));
            return statuses.includes('pad') ? 'pad' : statuses.includes('seed') ? 'seed' : statuses.includes('weak') ? 'weak' : 'missing';
        }
        if (requirement.relation === 'supply-group') {
            const statuses = requirement.targets.map(target => {
                const choices = requirement.capacitors.map(source => locality(source, target));
                return choices.includes('pad') ? 'pad' : choices.includes('seed') ? 'seed' : choices.includes('weak') ? 'weak' : 'missing';
            });
            return statuses.includes('missing') ? 'missing' : statuses.includes('weak') ? 'weak' : statuses.includes('seed') ? 'seed' : 'pad';
        }
        if (requirement.relation === 'separate-group') return seededTogether(requirement.source, requirement.target) ? 'missing' : 'pad';
        return 'missing';
    }
    return { circuit, rules, layouts, locality, requirementStatus, connectorPlacementWarning };
}
export type PcbIntentContext = ReturnType<typeof createIntentContext>;

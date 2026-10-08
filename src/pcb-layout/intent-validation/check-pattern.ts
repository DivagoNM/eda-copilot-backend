import type { CircuitPatternDefinition, CircuitPatternMatch, CircuitPatternRequirement } from './recognition/types.ts';
import type { PcbIntentContext } from './context.ts';
import type { PcbIntentDiagnostic } from './types.ts';
import { stableCompare } from './recognition/context.ts';

const labelPin = (p: { designator: string; pin_number: string | number }) => p.designator + '.' + String(p.pin_number);
function label(requirement: CircuitPatternRequirement): string {
    if (requirement.relation === 'local') return [...new Set([requirement, ...(requirement.alternatives ?? [])].map(r =>
        [labelPin(r.source), labelPin(r.target)].sort(stableCompare).join(' <-> ')))].sort(stableCompare).join(' or ');
    if (requirement.relation === 'supply-group') return 'supply group ' + requirement.targets.map(labelPin).sort(stableCompare).join(', ');
    if (requirement.relation === 'separate-group') return requirement.source + ' and ' + requirement.target + ' outside the same rigid localLayout';
    return requirement.relation;
}
export function checkPattern(pattern: CircuitPatternDefinition, match: CircuitPatternMatch, context: PcbIntentContext): PcbIntentDiagnostic[] {
    const missing = match.requirements.filter(r => ['missing', 'weak'].includes(context.requirementStatus(r)));
    if (!missing.length) return [];
    return [{ code: 'PCB_INTENT_' + pattern.id.replace(/-/g, '_').toUpperCase(), severity: 'warning',
        message: pattern.title + ': add or revise explicit placement intent for ' +
            [...new Set(missing.map(label))].sort(stableCompare).join('; ') + '. Component-center relations or block membership alone do not establish pad locality.',
        context: { components: match.components } }];
}

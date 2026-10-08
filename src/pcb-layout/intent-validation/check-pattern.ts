import type { CircuitPatternDefinition, CircuitPatternMatch, CircuitPatternRequirement } from './recognition/types.ts';
import type { PcbIntentContext } from './context.ts';
import type { PcbIntentDiagnostic } from './types.ts';
import { stableCompare } from './recognition/context.ts';

export type PcbIntentPatternChecker = {
    id: string;
    check: (match: CircuitPatternMatch, context: PcbIntentContext) => PcbIntentDiagnostic[];
};
const labelPin = (p: { designator: string; pin_number: string | number }) => p.designator + '.' + String(p.pin_number);
function label(requirement: CircuitPatternRequirement): string {
    if (requirement.relation === 'local') {
        const choices = [requirement, ...(requirement.alternatives ?? [])].map(r =>
            [labelPin(r.source), labelPin(r.target)].sort(stableCompare).join(' <-> '));
        return [...new Set(choices)].sort(stableCompare).join(' or ');
    }
    if (requirement.relation === 'supply-group') return 'supply group ' + requirement.targets.map(labelPin).sort(stableCompare).join(', ');
    if (requirement.relation === 'edge') return requirement.source + ' at the ' + requirement.edge + ' edge';
    return requirement.source + ' ' + requirement.relation + ' ' + requirement.target;
}
/** One checker per catalog entry; family semantics are shared, not copied. */
export function createPatternChecker(pattern: CircuitPatternDefinition): PcbIntentPatternChecker {
    return {
        id: pattern.id,
        check(match, context) {
            const missing = match.requirements.map(requirement => ({ requirement, status: context.requirementStatus(requirement) }))
                .filter(item => item.status === 'missing' || item.status === 'weak');
            if (!missing.length) return [];
            const locations = context.locationsFor(match);
            return [{
                code: 'PCB_INTENT_' + pattern.id.replace(/-/g, '_').toUpperCase(),
                severity: 'warning',
                message: pattern.title + ': add explicit placement intent for ' +
                    [...new Set(missing.map(item => label(item.requirement)))].sort(stableCompare).join('; ') +
                    (missing.some(item => item.requirement.relation === 'local' || item.requirement.relation === 'supply-group')
                        ? '. Component-center relations or block membership alone do not establish pad locality.'
                        : '. Express the confirmed application requirement explicitly in the DSL.'),
                context: { components: match.components, ...(locations.length ? { locations } : {}) },
            }];
        },
    };
}

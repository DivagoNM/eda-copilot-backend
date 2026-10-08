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
    if (requirement.relation === 'rotation') return requirement.source + ' restricted to rotations ' + requirement.allowed.join(', ');
    if (requirement.relation === 'connector-placement') return requirement.source + ' mechanically anchored within ' + requirement.maxEdgeDistance + ' mm of the board outline';
    if (requirement.relation === 'keepout') return requirement.source + ' keepout region ' + requirement.region;
    if (requirement.relation === 'separate-group') return requirement.source + ' and ' + requirement.target + ' outside the same rigid localLayout';
    if (requirement.relation === 'balanced') return 'authored pad spans for ' + requirement.branches.map(b => labelPin(b.source) + ' <-> ' + labelPin(b.target)).join(', ') + ' differing by at most ' + requirement.maxDifference + ' mm';
    if (requirement.relation === 'alignment') return requirement.source + ' aligned with ' + requirement.target + ' on ' + requirement.axis + ' within ' + requirement.tolerance + ' mm';
    return requirement.source + ' ' + requirement.relation + ' ' + requirement.target;
}
/** One checker per catalog entry; family semantics are shared, not copied. */
export function createPatternChecker(pattern: CircuitPatternDefinition): PcbIntentPatternChecker {
    return {
        id: pattern.id,
        check(match, context) {
            const evaluated = match.requirements.map(requirement => ({ requirement, status: context.requirementStatus(requirement) }));
            const unavailable = evaluated.filter(item => item.status === 'unavailable');
            const coverage: PcbIntentDiagnostic[] = unavailable.length ? [{ code: 'PCB_INTENT_' + pattern.id.replace(/-/g, '_').toUpperCase() + '_COVERAGE',
                severity: 'info', message: pattern.title + ': geometry checks require common-frame authored poses' +
                    (unavailable.some(item => item.requirement.relation === 'balanced') ? ', confirmed branch roles, explicit component layers and unambiguous supplied footprint pads' : '') + '. Unverified requirements: ' + unavailable.map(item => label(item.requirement)).join('; ') + '.',
                context: { components: match.components } }] : [];
            const missing = evaluated
                .filter(item => item.status === 'missing' || item.status === 'weak');
            if (!missing.length) return coverage;
            const locations = context.locationsFor(match);
            return [...coverage, {
                code: 'PCB_INTENT_' + pattern.id.replace(/-/g, '_').toUpperCase(),
                severity: 'warning',
                message: pattern.title + ': add or revise explicit placement intent for ' +
                    [...new Set(missing.map(item => label(item.requirement)))].sort(stableCompare).join('; ') +
                    (missing.some(item => item.requirement.relation === 'local' || item.requirement.relation === 'supply-group')
                        ? '. Component-center relations or block membership alone do not establish pad locality.'
                        : '. Express the confirmed application requirement explicitly in the DSL.'),
                context: { components: match.components, ...(locations.length ? { locations } : {}) },
            }];
        },
    };
}

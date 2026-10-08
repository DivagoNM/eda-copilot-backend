import type { CircuitPatternContext } from './context.ts';
import type { CircuitPatternDefinition, CircuitPatternMatch } from './types.ts';

export function withBranchIntent(ctx: CircuitPatternContext, definition: CircuitPatternDefinition, match: CircuitPatternMatch): CircuitPatternMatch {
    let requirements = [...match.requirements, ...(definition.boardRequirements ?? []).map(requirement => ({ ...requirement }))];
    for (const { role, ...requirement } of definition.componentRequirements ?? []) {
        if (match.roles[role]) requirements.push({ ...requirement, source: match.roles[role] });
    }
    if (definition.gateResistorAnchors) {
        const side = ctx.knowledge?.components?.[match.roles[definition.gateResistorAnchors.driver]]?.preferredGateResistorSide;
        if (side) {
            const anchor = match.roles[definition.gateResistorAnchors[side]];
            requirements = requirements.filter(r => r.relation !== 'local' || r.source.designator === anchor || r.target.designator === anchor);
        }
    }
    for (const balance of definition.balancedBranches ?? []) {
        const tolerance = ctx.knowledge?.components?.[match.roles[balance.owner]]?.branchLengthTolerance;
        if (tolerance === undefined || !balance.pairs.every(([a, b]) => match.pins[a] && match.pins[b])) continue;
        const ambiguous = Object.entries(balance.requiresFunctions ?? {}).some(([role, fn]) => {
            const component = ctx.byDesignator.get(match.roles[role]);
            return !component || !ctx.hasFunction(component, fn);
        });
        requirements.push({ relation: 'balanced', branches: balance.pairs.map(([a, b]) => ({ source: match.pins[a], target: match.pins[b] })),
            maxDifference: tolerance, ...(ambiguous ? { ambiguous: true } : {}) });
    }
    return { ...match, requirements };
}

import { pattern } from '../recognition/catalog/connector-placement.ts';
import type { PcbIntentPatternChecker } from '../check-pattern.ts';

export const checker: PcbIntentPatternChecker = {
    id: pattern.id,
    check(match, context) {
        return match.requirements.flatMap(requirement => {
            if (requirement.relation !== 'connector-placement') return [];
            const message = context.connectorPlacementWarning(requirement.source, requirement.maxEdgeDistance);
            if (!message) return [];
            const locations = context.locationsFor(match);
            return [{ code: 'PCB_INTENT_CONNECTOR_PLACEMENT', severity: 'warning' as const, message,
                context: { components: match.components, ...(locations.length ? { locations } : {}) } }];
        });
    },
};

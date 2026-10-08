import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: 'connector-placement',
    title: 'Connector mechanical placement',
    nodes: [{ id: 'connector', kind: 'connector', pins: {} }],
    componentRequirements: [{ role: 'connector', relation: 'connector-placement', maxEdgeDistance: 5 }],
    check(match, context) {
        return match.requirements.flatMap(requirement => {
            if (requirement.relation !== 'connector-placement') return [];
            const message = context.connectorPlacementWarning(requirement.source, requirement.maxEdgeDistance);
            if (!message) return [];
            return [{ code: 'PCB_INTENT_CONNECTOR_PLACEMENT', severity: 'warning' as const, message,
                context: { components: match.components } }];
        });
    },
};

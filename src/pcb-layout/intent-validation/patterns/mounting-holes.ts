import type { CircuitPatternDefinition } from '../recognition/types.ts';

export const pattern: CircuitPatternDefinition = {
    id: 'mounting-holes',
    title: 'Board mounting holes',
    boardRequirements: [{ relation: 'mounting-holes', minimumCount: 1 }],
    check(match, context) {
        const missing = match.requirements.some(requirement => requirement.relation === 'mounting-holes' && context.requirementStatus(requirement) === 'missing');
        return missing ? [{ code: 'PCB_INTENT_MOUNTING_HOLES', severity: 'info',
            message: 'No mounting holes were identified in the provided schematic or placement DSL. Consider adding at least one mounting hole or confirm that the board is secured by another method.' }] : [];
    },
};

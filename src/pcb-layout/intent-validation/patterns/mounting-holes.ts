import { pattern } from '../recognition/catalog/mounting-holes.ts';
import type { PcbIntentPatternChecker } from '../check-pattern.ts';

export const checker: PcbIntentPatternChecker = {
    id: pattern.id,
    check(match, context) {
        const missing = match.requirements.some(requirement => requirement.relation === 'mounting-holes' && context.requirementStatus(requirement) === 'missing');
        return missing ? [{ code: 'PCB_INTENT_MOUNTING_HOLES', severity: 'info',
            message: 'No mounting holes were identified in the provided schematic or placement DSL. Consider adding at least one mounting hole or confirm that the board is secured by another method.' }] : [];
    },
};

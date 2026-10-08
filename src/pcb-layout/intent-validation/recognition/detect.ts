import { createCircuitPatternContext, stableCompare } from './context.ts';
import { matchCircuitPattern } from './match.ts';
import { circuitPatternRegistry } from './registry.ts';
import type { CircuitPatternMatch, DetectCircuitPatternsInput } from './types.ts';
import { withEntryChain } from './entry-chain.ts';
import { withBranchIntent } from './branch-intent.ts';
import { detectSpecialPattern } from './special.ts';

/** Recognizes circuit motifs and declared mechanical roles; does not run the DSL, resolve parts or place anything. */
export function detectCircuitPatterns(input: DetectCircuitPatternsInput): CircuitPatternMatch[] {
    const context = createCircuitPatternContext(input);
    return circuitPatternRegistry.flatMap(pattern => [
        ...matchCircuitPattern(context, pattern).map(match => {
            const enriched = withBranchIntent(context, pattern, match);
            return pattern.entryChain ? withEntryChain(context, enriched) : enriched;
        }),
        ...(pattern.placementPurposes && pattern.special !== 'placement' ? detectSpecialPattern(context, { ...pattern, special: 'placement' }) : []),
    ])
        .sort((a, b) => stableCompare(a.patternId, b.patternId) || stableCompare(JSON.stringify(a), JSON.stringify(b)));
}

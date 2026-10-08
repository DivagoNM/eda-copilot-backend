import { createCircuitPatternContext, stableCompare } from './context.ts';
import { matchCircuitPattern } from './match.ts';
import { circuitPatternRegistry } from './registry.ts';
import type { CircuitPatternMatch, DetectCircuitPatternsInput } from './types.ts';

/** Recognizes electrical motifs only; does not run the DSL, resolve parts or place anything. */
export function detectCircuitPatterns(input: DetectCircuitPatternsInput): CircuitPatternMatch[] {
    const context = createCircuitPatternContext(input);
    return circuitPatternRegistry.flatMap(pattern => matchCircuitPattern(context, pattern))
        .sort((a, b) => stableCompare(a.patternId, b.patternId) || stableCompare(JSON.stringify(a), JSON.stringify(b)));
}

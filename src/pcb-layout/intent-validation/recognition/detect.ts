import { createCircuitPatternContext } from './context.ts';
import { matchCircuitPattern } from './match.ts';
import { circuitPatternRegistry } from '../registry.ts';
import type { CircuitPatternMatch, DetectCircuitPatternsInput } from './types.ts';

/** Reusable recognition without DSL execution, placement or external device lookup. */
export function detectCircuitPatterns(input: DetectCircuitPatternsInput): CircuitPatternMatch[] {
    const context = createCircuitPatternContext(input);
    return circuitPatternRegistry.flatMap(pattern => matchCircuitPattern(context, pattern));
}

import { pattern } from '../recognition/catalog/instrumentation-gain.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

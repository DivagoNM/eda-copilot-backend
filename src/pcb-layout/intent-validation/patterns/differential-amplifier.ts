import { pattern } from '../recognition/catalog/differential-amplifier.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

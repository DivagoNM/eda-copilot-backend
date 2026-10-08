import { pattern } from '../recognition/catalog/active-oscillator.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

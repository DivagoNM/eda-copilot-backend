import { pattern } from '../recognition/catalog/adc-reference.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

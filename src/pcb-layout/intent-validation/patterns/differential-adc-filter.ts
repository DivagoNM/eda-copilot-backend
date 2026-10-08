import { pattern } from '../recognition/catalog/differential-adc-filter.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

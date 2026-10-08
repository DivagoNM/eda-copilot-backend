import { pattern } from '../recognition/catalog/charge-pump.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

import { pattern } from '../recognition/catalog/pll-filter.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

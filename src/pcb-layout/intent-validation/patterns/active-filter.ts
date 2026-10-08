import { pattern } from '../recognition/catalog/active-filter.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

import { pattern } from '../recognition/catalog/sense-input-filter.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

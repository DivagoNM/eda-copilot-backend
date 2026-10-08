import { pattern } from '../recognition/catalog/rf-matching.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

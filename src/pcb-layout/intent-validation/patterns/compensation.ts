import { pattern } from '../recognition/catalog/compensation.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

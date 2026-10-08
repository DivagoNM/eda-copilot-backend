import { pattern } from '../recognition/catalog/parallel-gates.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

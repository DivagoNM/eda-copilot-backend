import { pattern } from '../recognition/catalog/buck-boost-loops.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

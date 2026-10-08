import { pattern } from '../recognition/catalog/buck-loop.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

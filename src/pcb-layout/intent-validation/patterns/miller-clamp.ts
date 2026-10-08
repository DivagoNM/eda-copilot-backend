import { pattern } from '../recognition/catalog/miller-clamp.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

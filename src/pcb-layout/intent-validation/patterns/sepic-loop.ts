import { pattern } from '../recognition/catalog/sepic-loop.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

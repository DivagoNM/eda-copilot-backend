import { pattern } from '../recognition/catalog/flyback-secondary.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

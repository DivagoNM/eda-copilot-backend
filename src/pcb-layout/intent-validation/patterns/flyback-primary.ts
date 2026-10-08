import { pattern } from '../recognition/catalog/flyback-primary.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

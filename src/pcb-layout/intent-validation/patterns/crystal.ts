import { pattern } from '../recognition/catalog/crystal.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

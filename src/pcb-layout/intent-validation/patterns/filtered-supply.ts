import { pattern } from '../recognition/catalog/filtered-supply.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

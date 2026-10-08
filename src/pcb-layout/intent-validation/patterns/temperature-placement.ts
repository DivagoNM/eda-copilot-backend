import { pattern } from '../recognition/catalog/temperature-placement.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

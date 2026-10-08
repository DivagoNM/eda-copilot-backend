import { pattern } from '../recognition/catalog/ldo-caps.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

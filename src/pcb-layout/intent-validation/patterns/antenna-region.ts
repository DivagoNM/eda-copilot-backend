import { pattern } from '../recognition/catalog/antenna-region.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

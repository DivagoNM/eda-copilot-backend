import { pattern } from '../recognition/catalog/shared-rail-consumers.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

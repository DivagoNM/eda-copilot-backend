import { pattern } from '../recognition/catalog/rf-balun.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

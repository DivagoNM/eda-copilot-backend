import { pattern } from '../recognition/catalog/transimpedance.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

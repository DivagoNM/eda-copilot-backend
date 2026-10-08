import { pattern } from '../recognition/catalog/ac-coupling-pair.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

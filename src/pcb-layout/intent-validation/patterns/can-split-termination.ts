import { pattern } from '../recognition/catalog/can-split-termination.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

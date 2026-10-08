import { pattern } from '../recognition/catalog/gate-split-resistors.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

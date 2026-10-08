import { pattern } from '../recognition/catalog/driver-return.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

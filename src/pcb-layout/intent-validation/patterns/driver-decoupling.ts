import { pattern } from '../recognition/catalog/driver-decoupling.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

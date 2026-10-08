import { pattern } from '../recognition/catalog/distributed-supply.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

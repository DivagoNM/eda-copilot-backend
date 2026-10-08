import { pattern } from '../recognition/catalog/ethernet-magnetics.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

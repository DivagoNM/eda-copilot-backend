import { pattern } from '../recognition/catalog/controller-bias.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

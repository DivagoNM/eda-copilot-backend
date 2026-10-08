import { pattern } from '../recognition/catalog/bootstrap.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

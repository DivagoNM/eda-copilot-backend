import { pattern } from '../recognition/catalog/source-termination.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

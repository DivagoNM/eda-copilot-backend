import { pattern } from '../recognition/catalog/cold-junction.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

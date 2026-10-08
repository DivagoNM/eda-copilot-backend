import { pattern } from '../recognition/catalog/inductive-clamp.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

import { pattern } from '../recognition/catalog/reference-buffer.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

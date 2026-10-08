import { pattern } from '../recognition/catalog/dc-feedback.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

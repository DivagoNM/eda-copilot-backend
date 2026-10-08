import { pattern } from '../recognition/catalog/opamp-feedback.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

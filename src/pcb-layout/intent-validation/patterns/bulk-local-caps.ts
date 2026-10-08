import { pattern } from '../recognition/catalog/bulk-local-caps.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

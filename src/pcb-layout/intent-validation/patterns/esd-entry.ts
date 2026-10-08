import { pattern } from '../recognition/catalog/esd-entry.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

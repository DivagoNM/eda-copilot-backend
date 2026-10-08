import { pattern } from '../recognition/catalog/snubber.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

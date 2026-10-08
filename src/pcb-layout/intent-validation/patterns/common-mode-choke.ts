import { pattern } from '../recognition/catalog/common-mode-choke.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

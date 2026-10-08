import { pattern } from '../recognition/catalog/isolation-domains.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

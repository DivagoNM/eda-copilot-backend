import { pattern } from '../recognition/catalog/repeated-port-protection.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

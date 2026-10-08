import { pattern } from '../recognition/catalog/boost-loop.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

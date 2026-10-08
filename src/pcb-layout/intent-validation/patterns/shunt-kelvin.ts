import { pattern } from '../recognition/catalog/shunt-kelvin.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

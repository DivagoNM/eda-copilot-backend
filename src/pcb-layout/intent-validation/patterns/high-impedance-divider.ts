import { pattern } from '../recognition/catalog/high-impedance-divider.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

import { pattern } from '../recognition/catalog/internal-regulator-cap.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

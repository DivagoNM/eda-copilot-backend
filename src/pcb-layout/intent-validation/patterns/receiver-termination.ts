import { pattern } from '../recognition/catalog/receiver-termination.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

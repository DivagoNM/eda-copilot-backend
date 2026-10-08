import { pattern } from '../recognition/catalog/rs485-termination.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

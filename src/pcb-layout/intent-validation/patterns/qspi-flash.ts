import { pattern } from '../recognition/catalog/qspi-flash.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

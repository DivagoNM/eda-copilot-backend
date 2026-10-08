import { pattern } from '../recognition/catalog/usb-series-pair.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

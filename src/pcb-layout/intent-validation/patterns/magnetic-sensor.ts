import { pattern } from '../recognition/catalog/magnetic-sensor.ts';
import { createPatternChecker } from '../check-pattern.ts';

export const checker = createPatternChecker(pattern);

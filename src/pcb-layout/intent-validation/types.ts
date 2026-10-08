import type { MakePcbLayoutInput } from '../../pcb.ts';

export type PcbIntentDiagnostic = {
    code: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    context?: { components?: string[]; locations?: Array<{ line: number; column?: number }> };
};
export type ValidatePcbLayoutIntentInput = MakePcbLayoutInput;

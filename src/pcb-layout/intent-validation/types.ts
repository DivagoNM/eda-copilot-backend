import type { MakePcbLayoutInput } from '../../pcb.ts';
import type { CircuitPinRef } from './recognition/types.ts';

export type PcbIntentDiagnostic = {
    code: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    context?: { components?: string[]; locations?: Array<{ line: number; column?: number }> };
};
export type ValidatePcbLayoutIntentInput = MakePcbLayoutInput;

/** Physical component designators, independent of any editor's string/reference format. */
export type PcbSchematicGroups = {
    groups: readonly { components: readonly string[] }[];
    wireIslands?: readonly { net: string | null; pins: readonly CircuitPinRef[] }[];
    incomplete?: boolean;
};

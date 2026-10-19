import type { MakePcbLayoutInput } from '../../pcb.ts';
import type { CircuitPinRef } from './recognition/types.ts';

export type PcbIntentDiagnostic = {
    code: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    context?: { components?: string[]; locations?: Array<{ line: number; column?: number }> };
};
export type ValidatePcbLayoutIntentInput = MakePcbLayoutInput;

/** Blocks the designer declared in the schematic (`PCB Block`, `PCB Module`,
 * `PCB Attach`, `PCB Role` component properties), by physical designator. */
export type PcbSchematicBlockDeclarations = {
    blocks: readonly { name: string; components: readonly string[]; module?: string; attachTo?: string; role?: string }[];
    /** Some declarations could not be read or resolved. */
    incomplete?: boolean;
};

/** Physical component designators, independent of any editor's string/reference format. */
export type PcbSchematicGroups = {
    groups: readonly { components: readonly string[] }[];
    wireIslands?: readonly { net: string | null; pins: readonly CircuitPinRef[] }[];
    incomplete?: boolean;
    /** Explicit, unlike `groups`; their own completeness does not affect `incomplete`. */
    declarations?: PcbSchematicBlockDeclarations;
};

export { componentSearch, libraryList, searchReusedBlock, type ComponentSearchInput } from './components.ts';
export { extractCircuit, type ExtractCircuitInput } from './schematic.ts';
export { makePcbLayout, getPcbComponentSizes, disposeBackend, type MakePcbLayoutInput, type GetPcbComponentSizesInput, type PcbLayoutOptions, type PcbLayoutProgress, type PcbLayoutProgressReporter } from './pcb.ts';
export type * from './types.ts';
export { validatePcbLayoutIntent, detectCircuitPatterns } from './pcb.ts';
export type { ValidatePcbLayoutIntentInput, PcbIntentDiagnostic, CircuitPatternKnowledge, CircuitPatternMatch, CircuitPatternRequirement, CircuitPinRef, DetectCircuitPatternsInput } from './pcb.ts';

import { z } from 'zod';
import { ExplainCircuitStruct } from '../../types/circuit.ts';
import { ExistingPlacementSchema, FootprintSpecSchema } from '../../types/pcb/layout-model.ts';
import type { CircuitPatternKnowledge } from './recognition/types.ts';

export const knowledgeSchema: z.ZodType<CircuitPatternKnowledge> = z.object({
    components: z.record(z.string(), z.object({
        kind: z.string().optional(),
        functions: z.array(z.string()).optional(),
        pinFunctions: z.record(z.string(), z.string()).optional(),
        supplyGroups: z.array(z.array(z.union([z.string(), z.number()])).min(1)).optional(),
        placement: z.object({
            purpose: z.enum(['antenna', 'cold-junction', 'ambient-temperature', 'monitored-temperature', 'magnetic-sensor']),
            target: z.string().optional(), avoid: z.array(z.string()).optional(),
            edge: z.enum(['left', 'right', 'top', 'bottom']).optional(),
            minDistance: z.number().positive().optional(),
        }).optional(),
    })).optional(),
    isolation: z.object({ domains: z.record(z.string(), z.string().min(1)), minClearance: z.number().positive() }).optional(),
});
export const intentInputSchema = z.object({
    code: z.string().min(1), circuit: ExplainCircuitStruct(),
    footprints: z.record(z.string(), FootprintSpecSchema()).optional(),
    existingPlacement: ExistingPlacementSchema().optional(), knowledge: knowledgeSchema.optional(),
});

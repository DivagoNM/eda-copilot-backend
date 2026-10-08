import { z } from 'zod';
import { ExplainCircuitStruct } from '../../types/circuit.ts';
import { ExistingPlacementSchema, FootprintSpecSchema } from '../../types/pcb/layout-model.ts';
import type { CircuitPatternKnowledge } from './recognition/types.ts';

export const knowledgeSchema: z.ZodType<CircuitPatternKnowledge> = z.object({
    components: z.record(z.string(), z.object({
        kind: z.string().optional(),
        functions: z.array(z.string()).optional(),
        pinFunctions: z.record(z.string(), z.string()).optional(),
        channels: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number()]))).optional(),
        entryChain: z.object({ connector: z.string(), receiver: z.string(),
            protection: z.object({ component: z.string(), side: z.enum(['connector', 'receiver']) }).optional() }).optional(),
        branchLengthTolerance: z.number().nonnegative().optional(),
        preferredGateResistorSide: z.enum(['driver', 'device']).optional(),
        supplyGroups: z.array(z.array(z.union([z.string(), z.number()])).min(1)).optional(),
        interfaces: z.array(z.object({
            function: z.enum(['qspi', 'ospi']), peer: z.string(),
            signals: z.array(z.object({ source: z.union([z.string(), z.number()]), target: z.union([z.string(), z.number()]) })).min(1),
            minimumPriority: z.enum(['high', 'critical']).optional(),
        })).optional(),
        placement: z.object({
            purpose: z.enum(['antenna', 'cold-junction', 'ambient-temperature', 'monitored-temperature', 'magnetic-sensor', 'quiet-controller', 'external-load']),
            target: z.string().optional(), avoid: z.array(z.string()).optional(),
            edge: z.enum(['left', 'right', 'top', 'bottom']).optional(),
            minDistance: z.number().positive().optional(),
            rotations: z.array(z.number().int().min(0).max(359)).min(1).optional(),
            alignment: z.object({ axis: z.enum(['x', 'y', 'both']), tolerance: z.number().nonnegative(),
                offset: z.object({ x: z.number(), y: z.number() }).optional() }).optional(),
            keepout: z.object({ region: z.string().min(1), minimumWidth: z.number().positive().optional(),
                minimumHeight: z.number().positive().optional(), layers: z.array(z.enum(['top', 'bottom'])).min(1).optional(),
                allowBlocks: z.array(z.string()).optional() }).optional(),
        }).refine(p => !p.alignment || !!p.target, 'Alignment requires an explicit target.').optional(),
    })).optional(),
    isolation: z.object({ domains: z.record(z.string(), z.string().min(1)), minClearance: z.number().positive(),
        pinDomains: z.record(z.string(), z.record(z.string(), z.string().min(1))).optional() }).optional(),
});
export const intentInputSchema = z.object({
    code: z.string().min(1), circuit: ExplainCircuitStruct(),
    footprints: z.record(z.string(), FootprintSpecSchema()).optional(),
    existingPlacement: ExistingPlacementSchema().optional(), knowledge: knowledgeSchema.optional(),
});

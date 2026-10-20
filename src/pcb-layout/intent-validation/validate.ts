import { layoutSchema } from '../../pcb.ts';
import { createCircuitPatternContext, pinKey, stableCompare } from './recognition/context.ts';
import { matchCircuitPattern, groupRailMatches } from './recognition/match.ts';
import { LayoutRulesSchema, type PlacementRules } from '../../types/pcb/layout-rules.ts';
import { runPcbLayoutDsl } from '../pcb-layout-dsl/spec.ts';
import { instrumentLocalLayoutDsl, extractLocalLayouts, stripLocalLayoutCarriers, validateLocalLayouts, scopeLocalLayouts } from '../pcb-auto-place-v2/local-layout.ts';
import { applyExistingBoard, ensurePreservedComponentBlocks, resolvePreservedComponentDesignators } from '../existing-placement.ts';
import { applyPlacementPreviewFilter } from '../placement-input.ts';
import { validatePlacementRulesForCircuit } from '../placement-validation.ts';
import { createIntentContext } from './context.ts';
import { checkPattern } from './check-pattern.ts';
import { circuitPatternRegistry } from './registry.ts';
import type { PcbIntentDiagnostic, ValidatePcbLayoutIntentInput, PcbSchematicGroups } from './types.ts';
import { checkSchematicGroups } from './schematic-groups.ts';
import { checkSchematicDeclarations } from './schematic-declarations.ts';

/** Offline validation: no device lookup, placement, native solver or input mutation. */
export function validatePcbLayoutIntent(input: ValidatePcbLayoutIntentInput,
    schematicGroups?: PcbSchematicGroups): PcbIntentDiagnostic[] {
    const parsed = layoutSchema.safeParse(input);
    if (!parsed.success) return parsed.error.issues.map(issue => ({ code: 'PCB_INTENT_INPUT', severity: 'error',
        message: issue.path.join('.') + ': ' + issue.message }));
    const data = parsed.data;
    const circuit = data.circuit;
    const diagnostics: PcbIntentDiagnostic[] = [];
    const names = new Set<string>();
    for (const component of circuit.components) {
        if (names.has(component.designator)) diagnostics.push({ code: 'PCB_CIRCUIT_IDENTITY', severity: 'error',
            message: 'Duplicate component designator: ' + component.designator + '.', context: { components: [component.designator] } });
        names.add(component.designator);
        const pins = new Set<string>();
        for (const pin of component.pins) {
            const key = String(pin.pin_number);
            if (pins.has(key)) diagnostics.push({ code: 'PCB_CIRCUIT_IDENTITY', severity: 'error',
                message: 'Duplicate pin number: ' + component.designator + '.' + key + '.', context: { components: [component.designator] } });
            pins.add(key);
        }
    }
    if (!circuit.components.length) diagnostics.push({ code: 'PCB_INTENT_INPUT', severity: 'error', message: 'The circuit must contain components.' });
    if (diagnostics.length) return finish(diagnostics);

    // Keep the production runner unchanged. Its fresh VM cannot use ambient time or random values here.
    const deterministic = 'Object.defineProperty(globalThis.Math,"random",{value(){throw new Error("Random values are not supported by PCB intent validation.");},writable:false,configurable:false}); Object.defineProperty(globalThis,"Date",{value:undefined,writable:false,configurable:false});\n';
    const code = deterministic + instrumentLocalLayoutDsl(data.code);
    let raw: PlacementRules;
    try { raw = runPcbLayoutDsl(code); }
    catch (error) {
        const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
        const stack = error && typeof error === 'object' && 'stack' in error ? String(error.stack) : '';
        const position = stack.match(/pcb-layout-dsl\.js:(\d+)(?::(\d+))?/);
        const line = position ? Number(position[1]) - 1 - (code.split('\n').length - data.code.split('\n').length) : 0;
        return [{ code: 'PCB_DSL_EXECUTION', severity: 'error', message: 'PCB DSL execution failed: ' + message,
            ...(line > 0 ? { context: { locations: [{ line, ...(position?.[2] ? { column: Number(position[2]) } : {}) }] } } : {}) }];
    }
    let localLayouts: ReturnType<typeof extractLocalLayouts>;
    try { localLayouts = extractLocalLayouts(raw); }
    catch (error) { return [{ code: 'PCB_DSL_STRUCTURE', severity: 'error', message: error instanceof Error ? error.message : String(error) }]; }
    const schema = LayoutRulesSchema().safeParse(stripLocalLayoutCarriers(raw));
    if (!schema.success) return schema.error.issues.map(issue => ({ code: 'PCB_DSL_SCHEMA', severity: 'error',
        message: issue.path.join('.') + ': ' + issue.message }));
    let rules = schema.data;
    const authoredRules = rules;
    if (rules.preserve && (rules.preserve.board || rules.preserve.components !== undefined) &&
        (!data.existingPlacement || ((rules.preserve.board || rules.preserve.components === 'all') && !data.existingPlacement.board)))
        return [{ code: 'PCB_PRESERVE_CONTEXT', severity: 'error', message: 'preserve(...) requires the referenced existing placement and board.' }];
    try { rules = ensurePreservedComponentBlocks(circuit, applyExistingBoard(rules, data.existingPlacement), data.existingPlacement); }
    catch (error) { return [{ code: 'PCB_PRESERVE_CONTEXT', severity: 'error', message: error instanceof Error ? error.message : String(error) }]; }
    const componentRoles = Object.fromEntries(rules.component_rules.filter(r => r.role === 'connector').map(r => [r.designator, 'connector' as const]));
    let preview: ReturnType<typeof applyPlacementPreviewFilter>;
    try { preview = applyPlacementPreviewFilter(circuit, rules); }
    catch (error) { return [{ code: 'PCB_PREVIEW_FILTER', severity: 'error', message: error instanceof Error ? error.message : String(error) }]; }
    const effectiveCircuit = preview.circuit;
    rules = preview.rules;
    localLayouts = scopeLocalLayouts(localLayouts, rules);
    if (preview.preview.enabled) diagnostics.push({ code: 'PCB_INTENT_PREVIEW_SCOPE', severity: 'info',
        message: 'Intent validation is limited to components selected by the placement preview.' });
    try { validatePlacementRulesForCircuit(effectiveCircuit, rules); validateLocalLayouts(effectiveCircuit, rules, localLayouts); }
    catch (error) { return [{ code: 'PCB_DSL_STRUCTURE', severity: 'error', message: error instanceof Error ? error.message : String(error) }]; }
    diagnostics.push(...collectRefs(effectiveCircuit, rules));
    if (diagnostics.some(d => d.severity === 'error')) return finish(diagnostics);
    const recognition = createCircuitPatternContext({ circuit: effectiveCircuit, footprints: data.footprints, componentRoles }, rules, schematicGroups);
    const context = createIntentContext(recognition, rules, localLayouts, circuit, data.existingPlacement);
    for (const pattern of circuitPatternRegistry) for (const group of groupRailMatches(recognition, matchCircuitPattern(recognition, pattern))) {
        // Choose one complete alternative. Do not splice different capacitors' loop endpoints.
        const ranked = group.map(match => ({ match, missing: match.requirements.filter(r =>
            ['missing', 'weak'].includes(context.requirementStatus(r))).length }));
        ranked.sort((a, b) => a.missing - b.missing);
        const match = ranked[0].match;
        diagnostics.push(...(pattern.check ? pattern.check(match, context) : checkPattern(pattern, match, context)));
    }
    diagnostics.push(...checkSchematicGroups(schematicGroups, recognition));
    diagnostics.push(...checkSchematicDeclarations(schematicGroups?.declarations, authoredRules,
        declarationScope(effectiveCircuit, authoredRules, data.existingPlacement)));
    return finish(diagnostics);
}
/** Components this run places from the DSL. Preview filters already removed the
 * rest; preserved components that no DSL block owns keep their existing pose,
 * so their schematic declarations are not contradicted. */
function declarationScope(circuit: ValidatePcbLayoutIntentInput['circuit'], rules: PlacementRules,
    existingPlacement: ValidatePcbLayoutIntentInput['existingPlacement']) {
    const owned = new Set([...rules.blocks.flatMap(block => block.component_designators),
        ...rules.component_rules.flatMap(rule => rule.block_name ? [rule.designator] : [])]);
    const preserved = resolvePreservedComponentDesignators(rules.preserve, existingPlacement);
    return circuit.components.map(c => c.designator).filter(name => owned.has(name) || !preserved.has(name));
}
function collectRefs(circuit: ValidatePcbLayoutIntentInput['circuit'], rules: PlacementRules): PcbIntentDiagnostic[] {
    const allComponents = circuit.components;
    const synthetic = new Set([...rules.boardPads, ...rules.proceduralFeatures].map(c => c.name));
    const components = new Set(allComponents.map(c => c.designator));
    const pins = new Set(allComponents.flatMap(c => c.pins.map(p => pinKey(c.designator, p.pin_number))));
    const blocks = new Set(rules.blocks.map(b => b.name));
    const errors: PcbIntentDiagnostic[] = [];
    const unverified = new Set<string>();
    function visit(value: unknown) {
        if (!value || typeof value !== 'object') return;
        const target = value as { type?: string; designator?: string; pin_number?: string | number; block_name?: string };
        let invalid = false;
        if (target.type === 'pin') invalid = !target.designator || target.pin_number === undefined || !synthetic.has(target.designator) && !pins.has(pinKey(target.designator, target.pin_number));
        if (target.type === 'pin' && target.designator && synthetic.has(target.designator)) unverified.add(target.designator);
        if (target.type === 'component') invalid = !target.designator || !synthetic.has(target.designator) && !components.has(target.designator);
        if (target.type === 'block') invalid = !target.block_name || !blocks.has(target.block_name);
        if (invalid) errors.push({ code: 'PCB_TARGET_REF', severity: 'error', message: 'Unknown PCB target: ' +
            (target.designator ? target.designator + (target.pin_number !== undefined ? '.' + target.pin_number : '') : target.block_name) + '.',
            ...(target.designator ? { context: { components: [target.designator] } } : {}) });
        for (const item of Object.values(value)) visit(item);
    }
    visit(rules);
    if (unverified.size) errors.push({ code: 'PCB_INTENT_COVERAGE', severity: 'info',
        message: 'DSL-generated pad references are covered by production structural checks only; this validator does not independently verify their terminal identities.',
        context: { components: [...unverified].sort(stableCompare) } });
    for (const hint of rules.hints) {
        if (hint.relation !== 'bypass') continue;
        const target = allComponents.find(c => c.designator === hint.target.designator)?.pins
            .find(p => String(p.pin_number) === String(hint.target.pin_number));
        if (!target) continue;
        for (const name of hint.capacitors) {
            const capacitor = allComponents.find(c => c.designator === name);
            if (!capacitor) errors.push({ code: 'PCB_TARGET_REF', severity: 'error',
                message: 'Unknown bypass capacitor: ' + name + '.', context: { components: [name] } });
            else if (!capacitor.pins.some(p => p.signal_name && p.signal_name === target.signal_name))
                errors.push({ code: 'PCB_BYPASS_NET', severity: 'error',
                    message: 'Bypass capacitor ' + name + ' is not connected to the target pin net.',
                    context: { components: [name, hint.target.designator].sort(stableCompare) } });
        }
    }
    return errors;
}
function finish(diagnostics: PcbIntentDiagnostic[]): PcbIntentDiagnostic[] {
    const unique = new Map<string, PcbIntentDiagnostic>();
    for (const d of diagnostics) unique.set(JSON.stringify(d), d);
    const rank = { error: 0, warning: 1, info: 2 };
    return [...unique.values()].sort((a, b) => rank[a.severity] - rank[b.severity] || stableCompare(a.code, b.code) ||
        stableCompare(a.message, b.message) || stableCompare(JSON.stringify(a.context), JSON.stringify(b.context)));
}

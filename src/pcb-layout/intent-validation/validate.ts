import { detectCircuitPatterns } from './recognition/detect.ts';
import { createCircuitPatternContext, normalizeFunction, pinKey, stableCompare, RETURN, SUPPLY } from './recognition/context.ts';
import { findIsolationNetConflicts } from './recognition/isolation.ts';
import { interfacePinPairs } from './recognition/interfaces.ts';
import { LayoutRulesSchema, type PlacementRules } from '../../types/pcb/layout-rules.ts';
import { runPcbLayoutDsl, PcbLayoutDslError, type PcbDslCall } from '../pcb-layout-dsl/spec.ts';
import { instrumentLocalLayoutDsl, extractLocalLayouts, stripLocalLayoutCarriers, collectLocalLayoutErrors } from '../pcb-auto-place-v2/local-layout.ts';
import { applyExistingBoard, ensurePreservedComponentBlocks } from '../existing-placement.ts';
import { applyPlacementPreviewFilter, syntheticCircuitComponents } from '../placement-input.ts';
import { collectPlacementRuleErrors } from '../placement-validation.ts';
import { createIntentContext } from './context.ts';
import { pcbIntentPatternRegistry } from './registry.ts';
import { intentInputSchema } from './input.ts';
import type { PcbIntentDiagnostic, ValidatePcbLayoutIntentInput } from './types.ts';

/** Offline intent validation. Empty diagnostics do not certify electrical/routed/physical correctness. */
export function validatePcbLayoutIntent(input: ValidatePcbLayoutIntentInput): PcbIntentDiagnostic[] {
    const parsed = intentInputSchema.safeParse(input);
    if (!parsed.success) return parsed.error.issues.map(issue => ({
        code: 'PCB_INTENT_INPUT', severity: 'error', message: issue.path.join('.') + ': ' + issue.message,
    }));
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
    const recognition = createCircuitPatternContext({ circuit, knowledge: data.knowledge, footprints: data.footprints });
    for (const [designator, profile] of Object.entries(data.knowledge?.components ?? {})) {
        const component = circuit.components.find(c => c.designator === designator);
        const pinNumbers = new Set(component?.pins.map(p => String(p.pin_number)) ?? []);
        const referencedPins = [...Object.keys(profile.pinFunctions ?? {}), ...(profile.supplyGroups ?? []).flat().map(String),
            ...Object.values(profile.channels ?? {}).flatMap(channel => Object.values(channel).map(String))];
        const referencedComponents = [profile.placement?.target, ...(profile.placement?.avoid ?? []), profile.entryChain?.connector,
            profile.entryChain?.receiver, profile.entryChain?.protection?.component].filter((s): s is string => !!s);
        if (!component || referencedPins.some(p => !pinNumbers.has(p)) || referencedComponents.some(c => !names.has(c)))
            diagnostics.push({ code: 'PCB_KNOWLEDGE_REF', severity: 'error', message: 'Verified profile for ' + designator +
                ' references an unknown component or pin.', context: { components: [designator] } });
        const groupedPins = (profile.supplyGroups ?? []).flat().map(String);
        if (groupedPins.length !== new Set(groupedPins).size) diagnostics.push({ code: 'PCB_KNOWLEDGE_GROUP', severity: 'error',
            message: 'Supply groups for ' + designator + ' contain repeated pins.', context: { components: [designator] } });
        if (Object.values(profile.channels ?? {}).some(channel => {
            const functions = Object.keys(channel).map(normalizeFunction), pins = Object.values(channel).map(String);
            return !functions.length || new Set(functions).size !== functions.length || new Set(pins).size !== pins.length;
        })) diagnostics.push({ code: 'PCB_KNOWLEDGE_CHANNEL', severity: 'error',
            message: 'Channels for ' + designator + ' must have unique functions and distinct physical terminals.', context: { components: [designator] } });
        for (const bus of profile.interfaces ?? []) {
            const peer = circuit.components.find(c => c.designator === bus.peer);
            const endpoints = new Set<string>();
            if (!component || !peer || component === peer || bus.signals.some(signal => {
                const duplicate = endpoints.has('source:' + String(signal.source)) || endpoints.has('target:' + String(signal.target));
                endpoints.add('source:' + String(signal.source)); endpoints.add('target:' + String(signal.target));
                return duplicate || !interfacePinPairs(recognition, { designator, pin_number: signal.source }, { designator: bus.peer, pin_number: signal.target });
            })) diagnostics.push({ code: 'PCB_KNOWLEDGE_INTERFACE', severity: 'error',
                message: 'Interface for ' + designator + ' must reference unique, connected pins on a distinct peer.',
                context: { components: [designator, bus.peer].sort(stableCompare) } });
        }
    }
    if (Object.keys(data.knowledge?.isolation?.domains ?? {}).some(c => !names.has(c)))
        diagnostics.push({ code: 'PCB_KNOWLEDGE_REF', severity: 'error', message: 'Isolation domains reference an unknown component.' });
    for (const [name, domains] of Object.entries(data.knowledge?.isolation?.pinDomains ?? {})) {
        const component = circuit.components.find(c => c.designator === name);
        if (!component || Object.keys(domains).some(pin => !component.pins.some(p => String(p.pin_number) === pin)))
            diagnostics.push({ code: 'PCB_KNOWLEDGE_REF', severity: 'error', message: 'Isolation pin domains reference an unknown component or pin.', context: { components: [name] } });
    }
    if (!circuit.components.length) diagnostics.push({ code: 'PCB_INTENT_INPUT', severity: 'error', message: 'The circuit must contain components.' });
    if (diagnostics.some(d => d.severity === 'error')) return finish(diagnostics);

    for (const conflict of findIsolationNetConflicts(recognition)) diagnostics.push({ code: 'PCB_ISOLATION_NET', severity: 'error',
        message: 'Net ' + conflict.net + ' joins distinct declared isolation domains: ' + conflict.domains.join(', ') + '.',
        context: { components: conflict.components } });
    for (const choke of recognition.components) {
        const chain = data.knowledge?.components?.[choke.designator]?.entryChain;
        if (!chain) continue;
        const receiver = recognition.byDesignator.get(chain.receiver)!;
        const protection = chain.protection && recognition.byDesignator.get(chain.protection.component)!;
        const connector = recognition.byDesignator.get(chain.connector)!;
        const sides = [['IN+', 'OUT+', ['IN+', 'RX+', 'DP']], ['IN-', 'OUT-', ['IN-', 'RX-', 'DM']]] as const;
        if (recognition.kindOf(choke) !== 'common-mode-choke' || new Set([choke.designator, chain.connector, chain.receiver, ...(protection ? [protection.designator] : [])]).size !== (protection ? 4 : 3) ||
            sides.some(([input, output, aliases]) => {
                const a = recognition.pinsFor(choke, [input]), b = recognition.pinsFor(choke, [output]), target = recognition.pinsFor(receiver, [...aliases]);
                const protectionNet = chain.protection?.side === 'connector' ? a[0]?.signal_name : b[0]?.signal_name;
                return a.length !== 1 || b.length !== 1 || target.length !== 1 || b[0].signal_name !== target[0].signal_name ||
                    !connector.pins.some(p => p.signal_name === a[0].signal_name) || protection && !protection.pins.some(p =>
                        p.signal_name === protectionNet && ![...RETURN, ...SUPPLY].includes(recognition.functionOf(protection, p)));
            })) diagnostics.push({ code: 'PCB_KNOWLEDGE_CHAIN', severity: 'error',
                message: 'Entry chain for ' + choke.designator + ' does not match the declared connector, receiver or protection side.',
                context: { components: [choke.designator, chain.connector, chain.receiver, ...(protection ? [protection.designator] : [])].sort(stableCompare) } });
    }
    if (diagnostics.some(d => d.severity === 'error')) return finish(diagnostics);

    const instrumented = instrumentLocalLayoutDsl(data.code);
    const sourceLineOffset = instrumented.split('\n').length - data.code.split('\n').length;
    const calls: PcbDslCall[] = [];
    let raw: PlacementRules;
    try {
        raw = runPcbLayoutDsl(instrumented, { onCall: call => calls.push(call), sourceLineOffset });
    } catch (error) {
        if (!(error instanceof PcbLayoutDslError)) throw error;
        return [{ code: 'PCB_DSL_EXECUTION', severity: 'error', message: 'PCB DSL execution failed: ' + error.message,
            ...(error.location ? { context: { locations: [error.location] } } : {}) }];
    }
    const localLayouts = extractLocalLayouts(raw);
    const schema = LayoutRulesSchema().safeParse(stripLocalLayoutCarriers(raw));
    if (!schema.success) return schema.error.issues.map(issue => ({
        code: 'PCB_DSL_SCHEMA', severity: 'error', message: issue.path.join('.') + ': ' + issue.message,
    }));
    let rules = schema.data;
    if (rules.preserve && (rules.preserve.board || rules.preserve.components !== undefined) &&
        (!data.existingPlacement || ((rules.preserve.board || rules.preserve.components === 'all') && !data.existingPlacement.board))) {
        return [{ code: 'PCB_PRESERVE_CONTEXT', severity: 'error', message: 'preserve(...) requires the referenced existing placement and board.' }];
    }
    rules = ensurePreservedComponentBlocks(circuit, applyExistingBoard(rules, data.existingPlacement), data.existingPlacement);
    let effectiveCircuit = circuit;
    try {
        const preview = applyPlacementPreviewFilter(circuit, rules);
        effectiveCircuit = preview.circuit; rules = preview.rules;
        if (preview.preview.enabled) diagnostics.push({ code: 'PCB_INTENT_PREVIEW_SCOPE', severity: 'info',
            message: 'Intent validation is limited to components selected by the placement preview.' });
    } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('Invalid PCB placement preview filter:')) throw error;
        return [{ code: 'PCB_PREVIEW_FILTER', severity: 'error', message: error.message }];
    }
    diagnostics.push(...collectPlacementRuleErrors(effectiveCircuit, rules).map(d => ({ ...d, severity: 'error' as const })));
    diagnostics.push(...collectLocalLayoutErrors(effectiveCircuit, rules, localLayouts).map(message =>
        ({ code: 'PCB_LOCAL_LAYOUT', severity: 'error' as const, message })));
    diagnostics.push(...collectRefs(effectiveCircuit, rules));
    if (diagnostics.some(d => d.severity === 'error')) return finish(diagnostics);
    const componentRoles = Object.fromEntries(rules.component_rules.filter(rule => rule.role === 'connector')
        .map(rule => [rule.designator, 'connector' as const]));
    const fullCircuitContext = createCircuitPatternContext({ circuit, knowledge: data.knowledge, footprints: data.footprints, componentRoles });
    const context = createIntentContext(effectiveCircuit, rules, localLayouts, calls, data.footprints, data.existingPlacement, fullCircuitContext);
    const checks = new Map(pcbIntentPatternRegistry.map(check => [check.id, check]));
    for (const match of detectCircuitPatterns({ circuit: effectiveCircuit, knowledge: data.knowledge, footprints: data.footprints, componentRoles }))
        diagnostics.push(...checks.get(match.patternId)!.check(match, context));
    const limitations: string[] = [];
    if (!Object.keys(data.knowledge?.components ?? {}).length && !data.knowledge?.isolation)
        limitations.push('Device- and application-specific patterns require verified knowledge');
    if (Object.values(data.knowledge?.components ?? {}).some(p => {
        const placement = p.placement;
        return placement && (!placement.target && ['cold-junction', 'monitored-temperature', 'magnetic-sensor'].includes(placement.purpose) ||
            ['ambient-temperature', 'quiet-controller'].includes(placement.purpose) && !placement.avoid?.length ||
            placement.purpose === 'external-load' && !placement.target ||
            placement.purpose === 'antenna' && !placement.edge && !placement.target && !placement.avoid?.length && !placement.rotations && !placement.keepout);
    })) limitations.push('Some mechanical/application profiles lack their required target, interference sources or edge');
    if (Object.values(data.knowledge?.components ?? {}).some(p => p.placement?.purpose === 'quiet-controller' && !p.functions?.includes('flyback-controller')))
        limitations.push('Quiet flyback-controller checks require the confirmed flyback-controller function');
    if (effectiveCircuit.components.some(c => {
        const functions = c.pins.map(p => data.knowledge?.components?.[c.designator]?.pinFunctions?.[String(p.pin_number)] ?? p.name);
        return !data.knowledge?.components?.[c.designator]?.channels &&
            ['OUT', 'IN-', 'IN+', 'OSCIN', 'OSCOUT', 'BOOT', 'SW'].some(f => functions.filter(name => name.toUpperCase() === f).length > 1);
    })) limitations.push('Ambiguous multi-channel functions require channel-specific verified pinFunctions');
    if (effectiveCircuit.components.some(c => {
        const profile = data.knowledge?.components?.[c.designator];
        const protocol = profile?.functions?.some(f => f === 'ospi-host' || f === 'ospi-flash') ? 'ospi' :
            profile?.functions?.some(f => f === 'qspi-host' || f === 'qspi-flash') ? 'qspi' : undefined;
        if (!protocol || profile?.interfaces?.length) return false;
        const functions = c.pins.map(p => normalizeFunction(profile?.pinFunctions?.[String(p.pin_number)] ?? p.name));
        return Array.from({ length: protocol === 'ospi' ? 8 : 4 }, (_, i) => ['IO' + i, 'DQ' + i, protocol.toUpperCase() + '.IO' + i])
            .some(aliases => functions.filter(name => aliases.includes(name)).length !== 1);
    })) limitations.push('QSPI/OSPI bus coverage requires unambiguous data endpoints or an explicit interface map; speed needs require a declared minimumPriority');
    if (effectiveCircuit.components.some(c => data.knowledge?.components?.[c.designator]?.kind === 'shunt' && c.pins.length > 2 &&
        !c.pins.some(p => ['SENSE+', 'KELVIN+', 'S+', 'VS+'].includes(normalizeFunction(data.knowledge?.components?.[c.designator]?.pinFunctions?.[String(p.pin_number)] ?? p.name)))))
        limitations.push('Multi-terminal shunts require confirmed Kelvin sense pin functions');
    if (effectiveCircuit.components.some(c => c.pins.filter(p => /^(VDD|VCC)$/i.test(p.name)).length > 1 &&
        !data.knowledge?.components?.[c.designator]?.supplyGroups && !data.footprints?.[c.designator]))
        limitations.push('Distributed supply groups require footprint geometry or confirmed supplyGroups');
    if (effectiveCircuit.components.some(c => {
        const footprint = data.footprints?.[c.designator];
        if (!footprint) return false;
        return c.pins.some(pin => SUPPLY.includes(normalizeFunction(data.knowledge?.components?.[c.designator]?.pinFunctions?.[String(pin.pin_number)] ?? pin.name)) &&
            footprint.pads.filter(p => String(p.pin_number) === String(pin.pin_number)).length !== 1);
    })) limitations.push('Missing or repeated physical supply pads limit geometry coverage; DSL pin targets address logical pins, not individual duplicate pads');
    if (effectiveCircuit.components.some(c => !/^[RCL]\d+$/i.test(c.designator) &&
        c.pins.some(p => !p.name || /^\d+$/.test(p.name))))
        limitations.push('Unnamed or numeric-only functional pins cannot establish device roles');
    if (localLayouts.size) limitations.push('Authored localLayout poses establish explicit grouping; their distances are not electrically certified');
    if (limitations.length) diagnostics.push({ code: 'PCB_INTENT_COVERAGE', severity: 'info', message: limitations.join('. ') + '.' });
    return finish(diagnostics);
}
function collectRefs(circuit: ValidatePcbLayoutIntentInput['circuit'], rules: PlacementRules): PcbIntentDiagnostic[] {
    const allComponents = [...circuit.components, ...syntheticCircuitComponents(rules)];
    const components = new Set(allComponents.map(c => c.designator));
    const pins = new Set(allComponents.flatMap(c => c.pins.map(p => pinKey(c.designator, p.pin_number))));
    const blocks = new Set(rules.blocks.map(b => b.name));
    const errors: PcbIntentDiagnostic[] = [];
    function visit(value: unknown) {
        if (!value || typeof value !== 'object') return;
        const target = value as { type?: string; designator?: string; pin_number?: string | number; block_name?: string };
        let invalid = false;
        if (target.type === 'pin') invalid = !target.designator || target.pin_number === undefined || !pins.has(pinKey(target.designator, target.pin_number));
        if (target.type === 'component') invalid = !target.designator || !components.has(target.designator);
        if (target.type === 'block') invalid = !target.block_name || !blocks.has(target.block_name);
        if (invalid) errors.push({ code: 'PCB_TARGET_REF', severity: 'error', message: 'Unknown PCB target: ' +
            (target.designator ? target.designator + (target.pin_number !== undefined ? '.' + target.pin_number : '') : target.block_name) + '.',
            ...(target.designator ? { context: { components: [target.designator] } } : {}) });
        for (const item of Object.values(value)) visit(item);
    }
    visit(rules);
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

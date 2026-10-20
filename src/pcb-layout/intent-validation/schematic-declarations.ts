import type { PlacementRules } from '../../types/pcb/layout-rules.ts';
import { PCB_BLOCK_ROLES } from '../../types/pcb/layout-rules.ts';
import { MAX_BLOCK_COMPONENTS } from '../placement-input.ts';
import { stableCompare } from './recognition/context.ts';
import type { PcbIntentDiagnostic, PcbSchematicBlockDeclarations } from './types.ts';

type Declarations = PcbSchematicBlockDeclarations | undefined;
type DeclaredBlock = PcbSchematicBlockDeclarations['blocks'][number];

const optionalText = (value: unknown) => value === undefined || value === null || typeof value === 'string';

/** Keeps every well-formed declared block. A malformed entry is reported and
 * skipped; only a missing block list makes the whole check unusable. */
function usableBlocks(declarations: Declarations): { blocks: DeclaredBlock[]; diagnostics: PcbIntentDiagnostic[] } {
    const entries: unknown = declarations ? declarations.blocks : [];
    if (!Array.isArray(entries)) throw new Error('declared blocks are not a list');
    const blocks: DeclaredBlock[] = [];
    const diagnostics: PcbIntentDiagnostic[] = [];
    entries.forEach((entry: Partial<Record<keyof DeclaredBlock, unknown>> | null, index) => {
        const named = typeof entry?.name === 'string' && entry.name.trim() !== '';
        if (named && Array.isArray(entry.components) && entry.components.every(name => typeof name === 'string')
            && optionalText(entry.module) && optionalText(entry.attachTo) && optionalText(entry.role)) {
            blocks.push({ name: entry.name as string, components: entry.components as string[],
                ...(entry.module ? { module: entry.module as string } : {}), ...(entry.attachTo ? { attachTo: entry.attachTo as string } : {}),
                ...(entry.role ? { role: entry.role as string } : {}) });
        } else diagnostics.push({ code: 'PCB_SCHEMATIC_DECLARATION_ENTRY', severity: 'info',
            message: 'Declared PCB block ' + (named ? entry!.name : '#' + (index + 1)) + ' is malformed and was skipped; the other declarations are checked.' });
    });
    return { blocks, diagnostics };
}

/** Module that places each DSL block. A satellite that no module lists belongs
 * to its parent's family, as in placement. */
function effectiveModules(rules: PlacementRules) {
    const direct = new Map<string, string>();
    for (const module of rules.modules) for (const block of module.block_names) if (!direct.has(block)) direct.set(block, module.name);
    const parent = new Map(rules.blocks.map(block => [block.name, block.attachTo ?? undefined]));
    const resolve = (name: string, seen = new Set<string>()): { module: string; through?: string } | undefined => {
        const module = direct.get(name);
        if (module) return { module };
        const up = parent.get(name);
        if (!up || seen.has(up)) return undefined;
        const inherited = resolve(up, seen.add(name));
        return inherited && { module: inherited.module, through: inherited.through ?? up };
    };
    return resolve;
}

/** A component in several declared blocks fits none of them. */
function sharedComponents(blocks: PcbSchematicBlockDeclarations['blocks']) {
    const owners = new Map<string, string[]>();
    for (const block of blocks) for (const name of new Set(block.components)) owners.set(name, [...(owners.get(name) ?? []), block.name]);
    return new Map([...owners].filter(([, names]) => names.length > 1));
}

/** Contradictions between the DSL and the schematic declarations are warnings,
 * never errors; any failure of this check is reported and skipped.
 * `rules` are the authored rules, before preview filtering or preserved-component
 * blocks; `components` are the designators this run places. */
export function checkSchematicDeclarations(declarations: Declarations, rules: PlacementRules,
    components: readonly string[]): PcbIntentDiagnostic[] {
    try {
        if (!declarations) return [];
        const usable = usableBlocks(declarations);
        const diagnostics: PcbIntentDiagnostic[] = [...usable.diagnostics];
        if (declarations.incomplete) diagnostics.push({ code: 'PCB_SCHEMATIC_DECLARATION_COVERAGE', severity: 'info',
            message: 'Some schematic PCB block declarations could not be read; the usable ones are checked.' });
        const present = new Set(components);
        const dslBlocks = new Map(rules.blocks.map(block => [block.name, block]));
        const dslBlocksOf = new Map<string, Set<string>>();
        const assign = (component: string, block: string) => dslBlocksOf.set(component, (dslBlocksOf.get(component) ?? new Set()).add(block));
        for (const block of rules.blocks) for (const component of block.component_designators) assign(component, block.name);
        for (const rule of rules.component_rules) if (rule.block_name) assign(rule.designator, rule.block_name);
        const moduleOf = effectiveModules(rules);
        const declared = new Set(usable.blocks.map(block => block.name));
        const warn = (code: string, message: string, members: readonly string[]) => diagnostics.push({ code, severity: 'warning', message,
            ...(members.length ? { context: { components: [...members].sort(stableCompare) } } : {}) });
        const shared = sharedComponents(usable.blocks);
        for (const [name, blocks] of [...shared].sort(([a], [b]) => stableCompare(a, b))) if (present.has(name))
            warn('PCB_SCHEMATIC_DECLARED_BLOCK_CONFLICT', 'Component ' + name + ' is declared in several PCB blocks (' +
                [...blocks].sort(stableCompare).join(', ') + '); a DSL block holds each component once, so its declaration is ignored.', [name]);
        for (const block of usable.blocks) {
            const members = block.components.filter(name => present.has(name) && !shared.has(name));
            if (!members.length) continue; // Outside a placement preview or not in this circuit.
            if (members.length > MAX_BLOCK_COMPONENTS) warn('PCB_SCHEMATIC_DECLARED_BLOCK_SIZE',
                'Declared PCB block ' + block.name + ' has ' + members.length + ' components; a DSL block holds at most ' + MAX_BLOCK_COMPONENTS + '.', members);
            const elsewhere = members.filter(name => !dslBlocksOf.get(name)?.has(block.name));
            if (elsewhere.length) warn('PCB_SCHEMATIC_DECLARED_BLOCK_MEMBERS', 'PCB block ' + block.name + ' is declared with ' +
                elsewhere.join(', ') + ', but the DSL ' + (dslBlocks.has(block.name) ? 'does not assign ' + (elsewhere.length > 1 ? 'them' : 'it') + ' to it.'
                    : 'has no block with that name.') + ' Review whether this change is intentional.', elsewhere);
            const dsl = dslBlocks.get(block.name);
            if (!dsl) continue;
            const placed = moduleOf(block.name);
            if (block.module && placed?.module !== block.module) warn('PCB_SCHEMATIC_DECLARED_BLOCK_MODULE',
                'PCB block ' + block.name + ' is declared in module ' + block.module + ' but the DSL ' + (placed ? 'puts it in ' + placed.module +
                    (placed.through ? ' through its parent ' + placed.through : '') + '.' : 'puts it in no module.'), members);
            if (block.attachTo && dsl.attachTo !== block.attachTo) warn('PCB_SCHEMATIC_DECLARED_BLOCK_ATTACH',
                'PCB block ' + block.name + ' is declared as attached to ' + block.attachTo + ' but the DSL ' +
                (dsl.attachTo ? 'attaches it to ' + dsl.attachTo + '.' : 'does not attach it.'), members);
            if (block.attachTo && !declared.has(block.attachTo) && !dslBlocks.has(block.attachTo)) warn('PCB_SCHEMATIC_DECLARED_BLOCK_ATTACH',
                'PCB block ' + block.name + ' is declared as attached to unknown block ' + block.attachTo + '.', members);
            if (block.role && dsl.role && block.role !== dsl.role) warn('PCB_SCHEMATIC_DECLARED_BLOCK_ROLE',
                'PCB block ' + block.name + ' is declared with role ' + block.role + ' but the DSL uses ' + dsl.role + '.', members);
        }
        return diagnostics;
    } catch (error) {
        return [{ code: 'PCB_SCHEMATIC_DECLARATION_CHECK', severity: 'info',
            message: 'Schematic PCB block declarations could not be checked: ' + (error instanceof Error ? error.message : String(error)) }];
    }
}

/** DSL skeleton for the declared hierarchy: blocks, roles, attachments and
 * modules only. Anchors, sizes and geometry are left to the author. Never throws. */
export function pcbLayoutDslSkeleton(declarations: Declarations): { code: string; diagnostics: PcbIntentDiagnostic[] } {
    const diagnostics: PcbIntentDiagnostic[] = [];
    try {
        const usable = usableBlocks(declarations);
        diagnostics.push(...usable.diagnostics);
        const shared = sharedComponents(usable.blocks);
        for (const [name, owners] of [...shared].sort(([a], [b]) => stableCompare(a, b))) diagnostics.push({ code: 'PCB_SCHEMATIC_DECLARED_BLOCK_CONFLICT',
            severity: 'warning', message: 'Component ' + name + ' is declared in several PCB blocks (' + [...owners].sort(stableCompare).join(', ') +
                '); it is left out of the skeleton.', context: { components: [name] } });
        const blocks = usable.blocks.map(block => ({ ...block, components: block.components.filter(name => !shared.has(name)) }))
            .filter(block => block.components.length).sort((a, b) => stableCompare(a.name, b.name));
        const names = new Set(blocks.map(block => block.name));
        const detached = attachmentCycleBreaks(blocks.filter(block => block.attachTo && names.has(block.attachTo)), diagnostics);
        const lines = blocks.map(block => {
            if (block.components.length > MAX_BLOCK_COMPONENTS) diagnostics.push({ code: 'PCB_SCHEMATIC_DECLARED_BLOCK_SIZE', severity: 'warning',
                message: 'Declared PCB block ' + block.name + ' has ' + block.components.length + ' components; a DSL block holds at most ' +
                    MAX_BLOCK_COMPONENTS + '. Split it before placement.', context: { components: [...block.components].sort(stableCompare) } });
            const role = block.role && (PCB_BLOCK_ROLES as readonly string[]).includes(block.role) ? block.role : 'generic';
            if (block.role && role !== block.role) diagnostics.push({ code: 'PCB_SCHEMATIC_DECLARED_BLOCK_ROLE', severity: 'warning',
                message: 'Declared role ' + block.role + ' of PCB block ' + block.name + ' is not a DSL block role; generic is used.' });
            const attach = block.attachTo && names.has(block.attachTo) && !detached.has(block.name) ? block.attachTo : undefined;
            if (block.attachTo && !names.has(block.attachTo)) diagnostics.push({ code: 'PCB_SCHEMATIC_DECLARED_BLOCK_ATTACH', severity: 'warning',
                message: 'PCB block ' + block.name + ' is declared as attached to unknown block ' + block.attachTo + '; placed as a main block.' });
            const options = attach ? ', { placement: "satellite", attachTo: ' + JSON.stringify(attach) + ' }' : '';
            return 'block(' + JSON.stringify(block.name) + ', ' + JSON.stringify([...block.components].sort(stableCompare)) + ', ' + JSON.stringify(role) + options + ');';
        });
        const modules = new Map<string, string[]>();
        for (const block of blocks) if (block.module) modules.set(block.module, [...(modules.get(block.module) ?? []), block.name]);
        for (const [module, members] of [...modules].sort(([a], [b]) => stableCompare(a, b)))
            lines.push('module(' + JSON.stringify(module) + ', ' + JSON.stringify(members) + ');');
        return { code: lines.length ? lines.join('\n') + '\n' : '', diagnostics };
    } catch (error) {
        return { code: '', diagnostics: [...diagnostics, { code: 'PCB_SCHEMATIC_DECLARATION_CHECK', severity: 'info',
            message: 'PCB DSL skeleton could not be generated: ' + (error instanceof Error ? error.message : String(error)) }] };
    }
}

/** Blocks whose declared attachment closes a cycle. In each cycle the first
 * block by name is placed as a main block, so the rest stay satellites. */
function attachmentCycleBreaks(attached: readonly DeclaredBlock[], diagnostics: PcbIntentDiagnostic[]) {
    const parent = new Map(attached.map(block => [block.name, block.attachTo!]));
    const breaks = new Set<string>();
    const done = new Set<string>();
    for (const start of [...parent.keys()].sort(stableCompare)) {
        const path: string[] = [];
        for (let name: string | undefined = start; name && !done.has(name); name = parent.get(name)) {
            const at = path.indexOf(name);
            if (at >= 0) {
                const cycle = path.slice(at);
                const main = [...cycle].sort(stableCompare)[0];
                breaks.add(main);
                diagnostics.push({ code: 'PCB_SCHEMATIC_DECLARED_BLOCK_ATTACH', severity: 'warning',
                    message: 'Declared PCB blocks ' + [...cycle, name].join(' -> ') + ' attach to each other in a cycle; ' + main + ' is placed as a main block.' });
                break;
            }
            path.push(name);
        }
        for (const name of path) done.add(name);
    }
    return breaks;
}

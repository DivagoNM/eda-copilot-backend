import type { PlacementRules } from '../../types/pcb/layout-rules.ts';
import { PCB_BLOCK_ROLES } from '../../types/pcb/layout-rules.ts';
import { MAX_BLOCK_COMPONENTS } from '../placement-input.ts';
import { stableCompare } from './recognition/context.ts';
import type { PcbIntentDiagnostic, PcbSchematicBlockDeclarations } from './types.ts';

type Declarations = PcbSchematicBlockDeclarations | undefined;

/** Contradictions between the DSL and the schematic declarations are warnings,
 * never errors; any failure of this check is reported and skipped. */
export function checkSchematicDeclarations(declarations: Declarations, rules: PlacementRules,
    components: readonly string[]): PcbIntentDiagnostic[] {
    try {
        if (!declarations) return [];
        const diagnostics: PcbIntentDiagnostic[] = [];
        if (declarations.incomplete) diagnostics.push({ code: 'PCB_SCHEMATIC_DECLARATION_COVERAGE', severity: 'info',
            message: 'Some schematic PCB block declarations could not be read; the usable ones are checked.' });
        const present = new Set(components);
        const dslBlocks = new Map(rules.blocks.map(block => [block.name, block]));
        const dslBlocksOf = new Map<string, Set<string>>();
        const assign = (component: string, block: string) => dslBlocksOf.set(component, (dslBlocksOf.get(component) ?? new Set()).add(block));
        for (const block of rules.blocks) for (const component of block.component_designators) assign(component, block.name);
        for (const rule of rules.component_rules) if (rule.block_name) assign(rule.designator, rule.block_name);
        const moduleOf = new Map<string, string>();
        for (const module of rules.modules) for (const block of module.block_names) moduleOf.set(block, module.name);
        const declared = new Set(declarations.blocks.map(block => block.name));
        const warn = (code: string, message: string, members: readonly string[]) => diagnostics.push({ code, severity: 'warning', message,
            ...(members.length ? { context: { components: [...members].sort(stableCompare) } } : {}) });
        for (const block of declarations.blocks) {
            const members = block.components.filter(name => present.has(name));
            if (!members.length) continue; // Outside a placement preview or not in this circuit.
            if (members.length > MAX_BLOCK_COMPONENTS) warn('PCB_SCHEMATIC_DECLARED_BLOCK_SIZE',
                'Declared PCB block ' + block.name + ' has ' + members.length + ' components; a DSL block holds at most ' + MAX_BLOCK_COMPONENTS + '.', members);
            const elsewhere = members.filter(name => !dslBlocksOf.get(name)?.has(block.name));
            if (elsewhere.length) warn('PCB_SCHEMATIC_DECLARED_BLOCK_MEMBERS', 'PCB block ' + block.name + ' is declared with ' +
                elsewhere.join(', ') + ', but the DSL ' + (dslBlocks.has(block.name) ? 'does not assign ' + (elsewhere.length > 1 ? 'them' : 'it') + ' to it.'
                    : 'has no block with that name.') + ' Review whether this change is intentional.', elsewhere);
            const dsl = dslBlocks.get(block.name);
            if (!dsl) continue;
            if (block.module && moduleOf.get(block.name) !== block.module) warn('PCB_SCHEMATIC_DECLARED_BLOCK_MODULE',
                'PCB block ' + block.name + ' is declared in module ' + block.module + ' but the DSL ' +
                (moduleOf.has(block.name) ? 'puts it in ' + moduleOf.get(block.name) + '.' : 'puts it in no module.'), members);
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
        const blocks = [...(declarations?.blocks ?? [])].filter(block => block.components.length).sort((a, b) => stableCompare(a.name, b.name));
        const names = new Set(blocks.map(block => block.name));
        const lines = blocks.map(block => {
            const role = block.role && (PCB_BLOCK_ROLES as readonly string[]).includes(block.role) ? block.role : 'generic';
            if (block.role && role !== block.role) diagnostics.push({ code: 'PCB_SCHEMATIC_DECLARED_BLOCK_ROLE', severity: 'warning',
                message: 'Declared role ' + block.role + ' of PCB block ' + block.name + ' is not a DSL block role; generic is used.' });
            const attach = block.attachTo && names.has(block.attachTo) ? block.attachTo : undefined;
            if (block.attachTo && !attach) diagnostics.push({ code: 'PCB_SCHEMATIC_DECLARED_BLOCK_ATTACH', severity: 'warning',
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

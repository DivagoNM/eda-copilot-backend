import type { CircuitPatternContext } from './recognition/context.ts';
import { stableCompare } from './recognition/context.ts';
import type { PcbIntentDiagnostic, PcbSchematicGroups } from './types.ts';
import { MAX_BLOCK_COMPONENTS } from '../placement-input.ts';

/** Group and wire disagreements are advisory; ownership filtering lives in recognition. */
export function checkSchematicGroups(groups: PcbSchematicGroups | undefined,
    recognition: CircuitPatternContext): PcbIntentDiagnostic[] {
    if (!groups) return [];
    const diagnostics: PcbIntentDiagnostic[] = [];
    if (groups.incomplete) diagnostics.push({ code: 'PCB_SCHEMATIC_GROUP_COVERAGE', severity: 'info',
        message: 'Schematic context is incomplete; available groups remain advisory and wire ownership inference is skipped.' });
    const normalized = [...new Map(groups.groups.map(group => {
        // Unknown members make this group unreliable, rather than implicitly shrinking it.
        const members = group.components.every(name => recognition.byDesignator.has(name)) ? [...new Set(group.components)].sort(stableCompare) : [];
        return [JSON.stringify(members), members] as const;
    })).values()].filter(group => group.length >= 2 && group.length <= MAX_BLOCK_COMPONENTS);
    const memberships = new Map<string, number>();
    for (const group of normalized) for (const member of group) memberships.set(member, (memberships.get(member) ?? 0) + 1);
    for (const group of normalized) {
        if (group.some(name => memberships.get(name)! > 1)) continue;
        // Separate connector/port blocks are intentional. Compare the functional core families.
        const members = group.filter(name => recognition.kindOf(recognition.byDesignator.get(name)!) !== 'connector');
        const assigned = members.map(name => recognition.environment.familyOf.get(name));
        if (assigned.includes(undefined)) continue;
        const families = [...new Set(assigned.filter(name => name !== undefined))];
        if (families.length < 2) continue;
        diagnostics.push({ code: 'PCB_SCHEMATIC_GROUP_MISMATCH', severity: 'info',
            message: 'A suggested schematic group spans separate PCB block families: ' + families.sort(stableCompare).join(', ') + '. Review whether this separation is intentional.',
            context: { components: members } });
    }
    const { wireOwners, assignedOwners, familyOf } = recognition.environment;
    for (const [component, owner] of wireOwners) {
        const assigned = assignedOwners.get(component);
        if (assigned?.size) {
            if ([...assigned].some(name => name !== owner)) diagnostics.push({ code: 'PCB_SCHEMATIC_WIRE_OWNER_MISMATCH', severity: 'info',
                message: 'Component ' + component + ' is assigned to ' + [...assigned].sort(stableCompare).join(', ') +
                    ' in the PCB DSL, but a small direct-wire island suggests ' + owner + '. Review whether this assignment is intentional.',
                context: { components: [...new Set([component, owner, ...assigned])].sort(stableCompare) } });
            continue;
        }
        const family = familyOf.get(component), ownerFamily = familyOf.get(owner);
        if (family && ownerFamily && family !== ownerFamily && !diagnostics.some(d => d.code === 'PCB_SCHEMATIC_GROUP_MISMATCH' &&
            d.context?.components?.includes(component) && d.context.components.includes(owner)))
            diagnostics.push({ code: 'PCB_SCHEMATIC_WIRE_FAMILY_MISMATCH', severity: 'info',
                message: 'Component ' + component + ' is in PCB family ' + family + ', but a small direct-wire island suggests an association with ' +
                    owner + ' in family ' + ownerFamily + '. Review whether this separation is intentional.',
                context: { components: [component, owner].sort(stableCompare) } });
    }
    return diagnostics;
}

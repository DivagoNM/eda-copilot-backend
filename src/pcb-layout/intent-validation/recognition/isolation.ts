import type { CircuitPatternContext } from './context.ts';
import { stableCompare } from './context.ts';

/** Exact nets may not join distinct explicitly declared domains. Bridging
 * components declare their domain separately on each side via pinDomains. */
export function findIsolationNetConflicts(ctx: CircuitPatternContext): Array<{ net: string; components: string[]; domains: string[] }> {
    const isolation = ctx.knowledge?.isolation;
    if (!isolation) return [];
    return [...ctx.byNet].flatMap(([net, endpoints]) => {
        const declared = endpoints.map(({ component, pin }) => ({ component: component.designator,
            domain: isolation.pinDomains?.[component.designator]?.[String(pin.pin_number)] ?? isolation.domains[component.designator] }))
            .filter((e): e is { component: string; domain: string } => !!e.domain);
        const domains = [...new Set(declared.map(e => e.domain))].sort(stableCompare);
        return domains.length > 1 ? [{ net, domains, components: [...new Set(declared.map(e => e.component))].sort(stableCompare) }] : [];
    }).sort((a, b) => stableCompare(a.net, b.net));
}

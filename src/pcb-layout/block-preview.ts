import type { PlacementGraph, PlacementInput, PlacementStage, PlacementTreeNode } from '#types/pcb/layout-model.ts';
import { solvePlacementSubtreeSync } from './pcb-auto-place-v2/tree-solver.ts';
import { createPlacementReport } from './pcb-auto-place/placement-report.ts';
import { createPcbLayout } from './pcb-auto-place/layout.ts';

export function solveBlockPreview(input: PlacementInput, graph: PlacementGraph, name: string) {
    const find = (node: PlacementTreeNode): PlacementTreeNode | undefined =>
        node.kind === 'block' && node.label === name ? node : node.children.map(find).find(Boolean);
    const node = find(graph.root);
    if (!node) throw new Error(`Block preview: missing tree node for "${name}".`);
    const started = performance.now();
    // Called inside the normal layout worker. This is the production subtree solver,
    // including all local hypotheses, islands, satellites and block refinement.
    const tree = solvePlacementSubtreeSync({ input, graph, node });
    const placements = tree.root.placements;
    const world = input.blocks.some(b => b.fixed) || input.components.some(c => c.pcb.fixedPlacement || c.pcb.edgeMount || c.pcb.edgePlace);
    const diagnostics = tree.diagnostics.map(d => ({ ...d, code: 'v2_solver' }));
    if (input.components.some(c => c.pcb.edgePlace && !c.pcb.fixedPlacement)) diagnostics.push({
        severity: 'error', code: 'v2_solver', nodeId: node.id,
        message: 'edgePlace requires board packing; its final edge placement is not solved in a block preview.',
    });
    const report = createPlacementReport(input, placements, diagnostics, { checkBoard: world });
    // A recovery layout with no accepted local candidate must never look successful.
    report.ok = report.ok && report.graphReport.ok && !diagnostics.some(d => d.severity === 'error');
    const layout = createPcbLayout(input, placements);
    const stages: PlacementStage[] = [{ name: '01-block-preview', placements, data: tree }];
    return { placements, report, layout, stages, blockPreview: {
        name, blocks: input.blocks.map(b => b.name), coordinateFrame: world ? 'board' as const : 'local' as const,
        placements, bbox: tree.root.bbox, placementOk: report.ok, solveMs: performance.now() - started,
    } };
}

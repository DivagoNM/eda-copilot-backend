import {componentAccessRows} from './pad-access.ts';
import {componentBodyBox} from '../../pcb-auto-place/geometry.ts';
import { loadNativeBoardPacker } from './load-native-board-packer.ts';
import * as fp from '../../f32.ts';
import type { Box, PcbComponent, Placement, PlacementInput } from '#types/pcb/layout-model.ts';
import { isConnectedSignalName } from '#utils/signals.ts';
import { boardBox, getBox, getPadWorld, componentPadBox, isThroughHolePad, padPlacementLayer } from '../../pcb-auto-place/geometry.ts';
import { expandHints, pathRelationWeight } from '../../pcb-auto-place/hints.ts';
import {
    targetDesignators,
    resolveTargetBox,
    resolveTargetPoint,
} from '../../pcb-auto-place/report-helpers.ts';
import {
    NATIVE_POST_PLACE_SCORE_CONTRACT_VERSION,
    type NativePathPort,
    type NativePostPlaceScoreProblemV1,
} from './contract.ts';

const EPSILON = 0.001;

export function encodeNativePostPlaceScoreProblem(
    input: PlacementInput,
    placements: Placement[],
): NativePostPlaceScoreProblemV1 {
    const placementByDesignator = new Map(placements.map((placement) => [placement.designator, placement]));
    const componentByDesignator = new Map(input.components.map((component) => [component.designator, component]));
    const ignored = new Set(input.solverOptions.ignoredRatsnestSignals.map((signal) => signal.toUpperCase()));
    const localScopes = postPlaceLocalScopes(input);
    const scopesByNet = new Map<string, Array<string | null>>();
    const pointsByNet = new Map<string, Array<{ x: number; y: number }>>();
    const ownersByNet = new Map<string, Array<string | null>>();
    const layersByNet = new Map<string, Array<string | null>>();
    const routingObstacles: NonNullable<NativePostPlaceScoreProblemV1['routingObstacles']> = [];
    for (const component of input.components) {
        const placement = placementByDesignator.get(component.designator);
        if (!placement) continue;
        for (const pad of component.footprint.pads) routingObstacles.push({
            box: componentPadBox(placement, pad), ref: `${component.designator}.${String(pad.pin_number)}`,
            net: component.pins.find(p => String(p.pin_number) === String(pad.pin_number))?.signal_name ?? undefined,
            layer: padPlacementLayer(pad, placement),
        });
        for (const pin of component.pins) {
            if (!isConnectedSignalName(pin.signal_name) || ignored.has(pin.signal_name.toUpperCase())) continue;
            const point = getPadWorld(component, placement, pin.pin_number);
            if (!point) continue;
            const points = pointsByNet.get(pin.signal_name) ?? [];
            points.push(point);
            pointsByNet.set(pin.signal_name, points);
            const pad = component.footprint.pads.find(p => String(p.pin_number) === String(pin.pin_number))!;
            const layers = layersByNet.get(pin.signal_name) ?? [];
            layers.push(padPlacementLayer(pad, placement) ?? null);
            layersByNet.set(pin.signal_name, layers);
            const owners = ownersByNet.get(pin.signal_name) ?? [];
            owners.push(component.pcb.role === 'main_ic' ? component.designator : null);
            ownersByNet.set(pin.signal_name, owners);
            const scopes = scopesByNet.get(pin.signal_name) ?? [];
            scopes.push(localScopes.get(component.designator) ?? null);
            scopesByNet.set(pin.signal_name, scopes);
        }
    }

    const weights = loadNativeBoardPacker().placementNetWeights([...pointsByNet.keys()], false);
    const result: NativePostPlaceScoreProblemV1 = {
        accessComponents: input.components.flatMap(c=>{const p=placementByDesignator.get(c.designator);return p?[{body:componentBodyBox(c,p),layer:p.layer,rows:componentAccessRows(c,p)}]:[];}),
        explicitConnections: input.hints.flatMap(h => {
            if (h.relation !== 'critical_pair' || h.source.type !== 'pin' || h.target.type !== 'pin') return [];
            const a=componentByDesignator.get(h.source.designator), b=componentByDesignator.get(h.target.designator);
            const ap=placementByDesignator.get(h.source.designator), bp=placementByDesignator.get(h.target.designator);
            if (!a || !b || !ap || !bp) return [];
            const source=getPadWorld(a,ap,h.source.pin_number), target=getPadWorld(b,bp,h.target.pin_number);
            const net=a.pins.find(p=>String(p.pin_number)===String(h.source.type==='pin' ? h.source.pin_number : ''))?.signal_name;
            const other=b.pins.find(p=>String(p.pin_number)===String(h.target.type==='pin' ? h.target.pin_number : ''))?.signal_name;
            if (!source || !target || !net || net!==other) return [];
            const padA=a.footprint.pads.find(p=>String(p.pin_number)===String(h.source.type==='pin' ? h.source.pin_number : ''))!;
            const padB=b.footprint.pads.find(p=>String(p.pin_number)===String(h.target.type==='pin' ? h.target.pin_number : ''))!;
            const la=padPlacementLayer(padA,ap), lb=padPlacementLayer(padB,bp);
            return [{source,target,net,layer:la===lb?la:!la?lb:!lb?la:undefined,kind:h.path?'signal_path' as const:'critical_pair' as const}];
        }),
        version: NATIVE_POST_PLACE_SCORE_CONTRACT_VERSION,
        routeClearance: input.board.clearances.component,
        routingObstacles,
        nets: [...pointsByNet.entries()].map(([name, points], index) => ({ name, points, layers: layersByNet.get(name), internalOwners: ownersByNet.get(name), localScopes: scopesByNet.get(name), weight: weights[index] })),
        distances: [],
        clearances: [],
        fixedPenalties: [],
        edges: [],
        paths: [],
    };

    const layerTerms: Array<[number, boolean]> = [];
    for (const rule of expandHints(input)) {
        const weight = rule.weight;
        if (rule.kind === 'distance' && rule.target && rule.target !== 'all') {
            const source = resolveTargetPoint(input, rule.source, placementByDesignator, componentByDesignator);
            const target = resolveTargetPoint(input, rule.target, placementByDesignator, componentByDesignator);
            if (source && target) result.distances.push({ source, target, weight, inverseTauSquared: rule.inverseTauSquared, min: rule.min, max: rule.max });
        }
        if (rule.kind === 'clearance' && rule.target && rule.min !== undefined) {
            const source = resolveTargetBox(input, rule.source, placementByDesignator, componentByDesignator);
            if (!source) continue;
            if (rule.target === 'all') {
                for (const component of input.components) {
                    if (targetDesignators(input, rule.source).includes(component.designator)) continue;
                    const placement = placementByDesignator.get(component.designator);
                    if (placement) result.clearances.push({ source, target: getBox(component, placement), minimum: rule.min, weight });
                }
            } else {
                const target = resolveTargetBox(input, rule.target, placementByDesignator, componentByDesignator);
                if (target) result.clearances.push({ source, target, minimum: rule.min, weight });
            }
        }
        const layers = (target: Parameters<typeof targetDesignators>[1]) => new Set(targetDesignators(input, target).flatMap(name => {
            const placement = placementByDesignator.get(name); return placement ? [placement.layer] : [];
        }));
        if (rule.kind === 'same_side' && rule.target && rule.target !== 'all') {
            const a = layers(rule.source), b = layers(rule.target);
            if (a.size && b.size && (new Set([...a, ...b]).size !== 1)) layerTerms.push([weight, true]);
        }
        if (rule.kind === 'prefer_layer' && rule.layer) {
            const source = layers(rule.source);
            if (source.size && (source.size !== 1 || !source.has(rule.layer))) layerTerms.push([weight, false]);
        }
        if (rule.kind === 'edge' && rule.edge) {
            const source = resolveTargetBox(input, rule.source, placementByDesignator, componentByDesignator);
            if (source) result.edges.push({ source, board: boardBox(input.board), edge: rule.edge, weight });
        }
    }

    for (const path of input.paths ?? []) {
        const ports: NativePathPort[] = [];
        for (const segment of path.segments) {
            const source = pathPort(componentByDesignator, placementByDesignator, path.id, segment.index * 2, segment.source, segment.index === 0 ? 'source' : 'exit');
            const target = pathPort(componentByDesignator, placementByDesignator, path.id, segment.index * 2 + 1, segment.target, segment.index === path.segments.length - 1 ? 'target' : 'entry');
            if (source) ports.push(source);
            if (target) ports.push(target);
        }
        result.paths.push({
            pathId: path.id,
            ports,
            shape: path.shape,
            priority: path.priority,
            weight: pathRelationWeight(input, path.id),
            preferFacingPads: path.preferFacingPads,
        });
    }
    result.fixedPenalties = loadNativeBoardPacker().placementLayerPenalties(layerTerms);
    return result;
}

function pathPort(
    components: Map<string, PcbComponent>,
    placements: Map<string, Placement>,
    pathId: string,
    order: number,
    target: { designator: string; pin_number: string | number },
    role: NativePathPort['role'],
): NativePathPort | null {
    const component = components.get(target.designator);
    const placement = placements.get(target.designator);
    if (!component || !placement) return null;
    const point = getPadWorld(component, placement, target.pin_number);
    if (!point) return null;
    const vector = { x: fp.sub(point.x, placement.x), y: fp.sub(point.y, placement.y) };
    const length = fp.hypot(vector.x, vector.y);
    return {
        ...point,
        pathId,
        order,
        ref: `${target.designator}.${String(target.pin_number)}`,
        role,
        normal: length > EPSILON ? { x: fp.div(vector.x, length), y: fp.div(vector.y, length) } : { x: 0, y: 0 },
    };
}

/** Preserve block/family ownership; shared supply nets must not link unrelated ICs. */
export function postPlaceLocalScopes(input: PlacementInput): Map<string, string> {
    const blocks = new Map(input.blocks.map(block => [block.name, block]));
    const scopes = new Map<string, string>();
    for (const block of input.blocks) {
        let root = block;
        const seen = new Set([root.name]);
        while (root.attachTo && blocks.has(root.attachTo) && !seen.has(root.attachTo)) {
            root = blocks.get(root.attachTo)!;
            seen.add(root.name);
        }
        for (const designator of block.component_designators) scopes.set(designator, root.name);
    }
    return scopes;
}

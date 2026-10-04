import type { PcbComponent, Placement } from '#types/pcb/layout-model.ts';
import { componentBodyBox, componentPadBox, getLocalPointWorld, isThroughHolePad } from '../../pcb-auto-place/geometry.ts';
import { loadNativeBoardPacker } from './load-native-board-packer.ts';
import type { NativeAccessRow } from './contract.ts';

const cache = new WeakMap<PcbComponent, ReturnType<ReturnType<typeof loadNativeBoardPacker>['placementAccessProfile']>>();

/** Geometry transport only. Eligibility, process dimensions and weights live in Rust. */
export function componentAccessProfile(component: PcbComponent) {
    const cached = cache.get(component);
    if (cached) return cached;
    const pose: Placement = { designator: component.designator, x: 0, y: 0, rotate: 0, layer: 'top', score: 0 };
    const profile = loadNativeBoardPacker().placementAccessProfile({
        role: component.pcb.role,
        body: componentBodyBox(component, pose),
        pads: component.footprint.pads.map(pad => ({
            box: componentPadBox(pose, pad),
            through: isThroughHolePad(pad),
            net: component.pins.find(pin => String(pin.pin_number) === String(pad.pin_number))?.signal_name ?? undefined,
        })),
    });
    cache.set(component, profile);
    return profile;
}

export function componentAccessRows(component: PcbComponent, pose: Placement): NativeAccessRow[] {
    return componentAccessProfile(component).rows.map(row => {
        const b = row.box;
        const corners = [
            { x: b.left, y: b.top }, { x: b.right, y: b.top },
            { x: b.right, y: b.bottom }, { x: b.left, y: b.bottom },
        ].map(point => getLocalPointWorld(pose, point));
        return {
            weight: row.weight,
            box: {
                left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)),
                top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y)),
            },
        };
    });
}

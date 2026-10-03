import { loadNativeBoardPacker } from './load-native-board-packer.ts';

const classes = new Map<string, {ground: boolean; power: boolean; switching: boolean}>();
/** Cache native classification; no independent PCB name heuristics in TS. */
export function placementNetClass(name: string) {
    let value = classes.get(name);
    if (!value) { value = loadNativeBoardPacker().placementNetClass(name); classes.set(name, value); }
    return value;
}

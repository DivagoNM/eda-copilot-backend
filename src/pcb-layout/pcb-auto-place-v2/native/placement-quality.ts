import type { Box, Point } from '#types/pcb/layout-model.ts';

export interface NativeIslandQuality {
    corePairs: boolean;
    bbox: Box;
    overlap: boolean;
    points: Array<{ reference: string; owner: string; net?: string | null; point: Point; center: Point; layer: string }>;
    pads: Array<{ reference: string; net?: string | null; box: Box; layer: string; throughHole: boolean }>;
    pairs: Array<[string, string]>;
    pairRelations?: Array<{relation: string; priority: string; weight?: number; minDistance?: number; maxDistance?: number; path?: boolean; core?: boolean; hard?: boolean}>;
    maxDistance?: number;
    powerNet?: string;
    returnNet?: string;
    centerPowerBus: boolean;
    axis?: string;
    pinOne?: { offset: Point; width: number; height: number };
    origin: Point;
}

export type NativeOrientationQuality =
    | { kind: 'pinOne'; offset: Point; width: number; height: number }
    | { kind: 'bypass' | 'targetPad'; offsets: Point[]; axis: 'x' | 'y' }
    | { kind: 'padAxis'; power: Point; ret: Point; axis: 'x' | 'y' }
    | { kind: 'rowPower'; power: Point; ret: Point; axis: 'x' | 'y'; side: number }
    | { kind: 'initial'; terms: Array<{ source: Point; target: Point; weight: number }> };

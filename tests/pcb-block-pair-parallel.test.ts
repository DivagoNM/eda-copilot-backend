import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadNativeBoardPacker } from '../src/pcb-layout/pcb-auto-place-v2/native/load-native-board-packer.ts';

// The pair neighbourhood runs speculatively on worker threads when a block has
// more than one thread; its solution must equal the serial loop exactly. These
// blocks accept several pairs within one speculative batch, so a wrong restart
// after an accepted pair changes their result.
test('parallel pair neighbourhood matches the serial result', () => {
    const addon = loadNativeBoardPacker();
    for (const fixture of ['ESPower/block-2', 'ESPower/block-21', 'Telemetry/block-22']) {
        const captured = JSON.parse(readFileSync(new URL(`./fixtures/block-placement/${fixture}.json`, import.meta.url), 'utf8'));
        const problem = { ...captured.problem, version: 4, searchWidth: 1,
            experiments: { ...captured.problem.experiments, pairSwaps: true, reinsertPair: true } };
        const serial = addon.solveBlockPrimitives(structuredClone(problem));
        for (const threads of [2, 4, 8]) {
            assert.deepEqual(addon.solveBlockPrimitivesBatch([structuredClone(problem)], threads)[0], serial, `${fixture}, ${threads} threads`);
        }
    }
});

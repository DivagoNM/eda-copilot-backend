import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const backend = fileURLToPath(new URL('../', import.meta.url));
const script = join(backend, 'scripts/debug-pcb-validation.mjs');
const debugRoot = join(backend, 'debugging/pcb-validation');
mkdirSync(debugRoot, { recursive: true });
const sandbox = mkdtempSync(join(debugRoot, 'cli-tests-'));
const circuit = { components: [
    { designator: 'U1', value: 'test', part_uuid: null, pins: [
        { pin_number: '1', name: 'BOOT', signal_name: 'boot' },
        { pin_number: '2', name: 'SW', signal_name: 'sw' },
    ] },
    { designator: 'C1', value: 'test', part_uuid: null, pins: [
        { pin_number: '1', name: '1', signal_name: 'boot' },
        { pin_number: '2', name: '2', signal_name: 'sw' },
    ] },
] };
const base = 'block("power", ["U1", "C1"]);';

function run(args: string[]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
        cwd: backend, encoding: 'utf8', windowsHide: true, timeout: 30_000,
    });
    assert.ifError(result.error);
    return result;
}

function custom(code: string) {
    const directory = mkdtempSync(join(sandbox, 'input-'));
    const codeFile = join(directory, 'placement with spaces.js');
    const circuitFile = join(directory, 'circuit.json');
    writeFileSync(codeFile, code);
    writeFileSync(circuitFile, JSON.stringify(circuit));
    return { directory, codeFile, circuitFile, args: ['--code', codeFile, '--circuit', circuitFile, '--output-dir', directory] };
}

function outputs(stdout: string) {
    return [...stdout.matchAll(/^Debug output: (.+)$/gm)].map(match => {
        const directory = match[1].trim();
        return {
            directory,
            summary: JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8')),
            diagnostics: JSON.parse(readFileSync(join(directory, 'diagnostics.json'), 'utf8')),
        };
    });
}

test('validation CLI lists directory names including fixtures with different input basenames', () => {
    const result = run(['--list']);
    assert.equal(result.status, 0, result.stderr);
    for (const name of ['rp2040_base', 'CNTRL_ACESS_MAX', 'ThunderF722']) assert.ok(result.stdout.includes('\n' + name + '\n'));
    assert.equal(result.stdout.includes('\nHanboo\n'), false);
    assert.equal(outputs(result.stdout).length, 0);
});

test('validation CLI saves minimal diagnostics and exact standalone input snapshots', () => {
    const input = custom(base + '\ncriticalPair(pin("U1",1),pin("C1",1)); criticalPair(pin("U1",2),pin("C1",2));');
    const knowledge = join(input.directory, 'knowledge.json');
    const footprints = join(input.directory, 'footprints.json');
    writeFileSync(knowledge, '{}\n');
    writeFileSync(footprints, '{}\n');
    const result = run([...input.args, '--knowledge', knowledge, '--footprints', footprints, '--strict']);
    assert.equal(result.status, 0, result.stderr);
    const [output] = outputs(result.stdout);
    assert.ok(output);
    assert.equal(output.summary.passed, true);
    assert.equal(output.summary.strict, true);
    assert.equal(output.summary.counts.error, 0);
    assert.equal(output.summary.counts.warning, 0);
    assert.ok(Array.isArray(output.diagnostics));
    for (const diagnostic of output.diagnostics) {
        assert.deepEqual(Object.keys(diagnostic).filter(key => !['code', 'severity', 'message', 'context'].includes(key)), []);
    }
    const source = join(output.directory, 'source');
    assert.equal(readFileSync(join(source, 'placement.js'), 'utf8'), readFileSync(input.codeFile, 'utf8'));
    assert.equal(readFileSync(join(source, 'circuit.json'), 'utf8'), readFileSync(input.circuitFile, 'utf8'));
    assert.equal(readFileSync(join(source, 'knowledge.json'), 'utf8'), '{}\n');
    assert.equal(readFileSync(join(source, 'footprints.json'), 'utf8'), '{}\n');
    assert.ok(existsSync(join(output.directory, 'summary.md')));
    assert.deepEqual(readdirSync(output.directory).sort(), ['diagnostics.json', 'source', 'summary.json', 'summary.md']);
});

test('validation CLI keeps warnings advisory unless strict mode is requested', () => {
    const input = custom(base);
    const normal = run(input.args);
    const strict = run([...input.args, '--strict']);
    assert.equal(normal.status, 0, normal.stderr);
    assert.equal(strict.status, 1, strict.stderr);
    const [normalOutput] = outputs(normal.stdout);
    const [strictOutput] = outputs(strict.stdout);
    assert.equal(normalOutput.summary.passed, true);
    assert.equal(strictOutput.summary.passed, false);
    assert.ok(normalOutput.summary.counts.warning > 0);
    assert.deepEqual(normalOutput.diagnostics, strictOutput.diagnostics);
    assert.ok(normalOutput.diagnostics.some((d: { code: string }) => d.code === 'PCB_INTENT_BOOTSTRAP'));
});

test('validation CLI captures DSL errors with source context and fails', () => {
    const input = custom(base + '\nunknownDslMethod();');
    const result = run(input.args);
    assert.equal(result.status, 1, result.stderr);
    const [output] = outputs(result.stdout);
    assert.equal(output.summary.passed, false);
    const diagnostic = output.diagnostics.find((d: { code: string }) => d.code === 'PCB_DSL_EXECUTION');
    assert.ok(diagnostic);
    assert.equal(diagnostic.severity, 'error');
    assert.equal(diagnostic.context.locations[0].line, 2);
    assert.equal('stack' in diagnostic, false);
});

test('validation CLI continues a batch after an error and loads fixture preserve context', () => {
    const result = run(['USB_ISOL', 'rp2040_base', 'ThunderF722', 'PortableScope', '--output-dir', sandbox]);
    assert.equal(result.status, 1, result.stderr);
    const reports = outputs(result.stdout);
    assert.deepEqual(reports.map(report => report.summary.fixture), ['USB_ISOL', 'rp2040_base', 'ThunderF722', 'PortableScope']);
    assert.ok(reports[0].summary.counts.error > 0);
    assert.equal(reports[1].summary.counts.error, 0);
    assert.ok(reports[2].summary.inputs.code.endsWith('Thunder F722.js'));
    assert.ok(reports[3].summary.inputs.existingPlacement.endsWith('existing-placement.json'));
    assert.equal(reports[3].diagnostics.some((d: { code: string }) => d.code === 'PCB_PRESERVE_CONTEXT'), false);
});

test('validation CLI reports input-file and argument failures separately from diagnostics', () => {
    const input = custom(base);
    writeFileSync(input.circuitFile, '{ invalid JSON');
    const malformed = run(input.args);
    assert.equal(malformed.status, 2);
    assert.match(malformed.stderr, /PCB validation failed/);
    assert.equal(outputs(malformed.stdout).length, 0);
    const incomplete = run(['--code', input.codeFile]);
    assert.equal(incomplete.status, 2);
    assert.match(incomplete.stderr, /requires --code and --circuit/);
    const unknown = run(['missing-fixture']);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /Unknown PCB fixture/);
    const batchOverride = run(['rp2040_base', 'esp32c3', '--code', input.codeFile]);
    assert.equal(batchOverride.status, 2);
    assert.match(batchOverride.stderr, /single fixture/);
});

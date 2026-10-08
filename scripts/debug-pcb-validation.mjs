import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validatePcbLayoutIntent } from '../src/pcb-layout/intent-validation/validate.ts';

const backend = fileURLToPath(new URL('../', import.meta.url));
const fixtureRoot = join(backend, 'tests/pcb-layout');
const optionalInputs = {
    footprints: ['footprints', 'footprints.json'],
    existingPlacement: ['existing-placement', 'existing-placement.json'],
};

function fixtures() {
    return new Map(readdirSync(fixtureRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
        .flatMap(entry => {
            const directory = join(fixtureRoot, entry.name);
            const files = readdirSync(directory);
            const stems = files.filter(file => file.endsWith('.js') && files.includes(file.slice(0, -3) + '.json'))
                .map(file => file.slice(0, -3));
            if (!stems.length) return [];
            // Alternate DSLs without a matching schematic are not the fixture's default input.
            const stem = stems.includes(entry.name) ? entry.name : stems.length === 1 ? stems[0] : null;
            return [[entry.name, { directory, stem }]];
        }));
}

function inputFiles(name, fixture, options) {
    if (fixture && !fixture.stem && (!options.code || !options.circuit))
        throw Error('Ambiguous PCB fixture: ' + name + '. Provide --code and --circuit.');
    const files = {
        code: options.code ? resolve(options.code) : join(fixture.directory, fixture.stem + '.js'),
        circuit: options.circuit ? resolve(options.circuit) : join(fixture.directory, fixture.stem + '.json'),
    };
    for (const [key, [option, filename]] of Object.entries(optionalInputs)) {
        if (options[option]) files[key] = resolve(options[option]);
        else if (fixture && existsSync(join(fixture.directory, filename))) files[key] = join(fixture.directory, filename);
    }
    return files;
}

function formatDiagnostic(diagnostic) {
    const components = diagnostic.context?.components?.join(', ');
    const locations = diagnostic.context?.locations?.map(location =>
        location.line + (location.column === undefined ? '' : ':' + location.column)).join(', ');
    const context = [components, locations && 'DSL ' + locations].filter(Boolean).join('; ');
    return `[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}` + (context ? ' (' + context + ')' : '');
}

function capture(name, files, options) {
    const sources = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, readFileSync(file, 'utf8')]));
    const input = Object.fromEntries(Object.entries(sources).map(([key, source]) =>
        [key, key === 'code' ? source : JSON.parse(source)]));
    const started = performance.now();
    const diagnostics = validatePcbLayoutIntent(input);
    const durationMs = performance.now() - started;
    const counts = { error: 0, warning: 0, info: 0 };
    for (const diagnostic of diagnostics) counts[diagnostic.severity]++;
    const passed = counts.error === 0 && (!options.strict || counts.warning === 0);
    const root = options['output-dir'] ? resolve(options['output-dir']) : join(backend, 'debugging/pcb-validation/runs');
    const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const parent = join(root, !safeName || safeName === '.' || safeName === '..' ? 'custom' : safeName);
    mkdirSync(parent, { recursive: true });
    const output = mkdtempSync(join(parent, new Date().toISOString().replace(/[:.]/g, '-') + '-'));
    mkdirSync(join(output, 'source'));
    for (const [key, source] of Object.entries(sources)) {
        const filename = key === 'code' ? 'placement.js' : key === 'circuit' ? 'circuit.json' : optionalInputs[key][1];
        writeFileSync(join(output, 'source', filename), source);
    }
    const summary = { fixture: name, passed, strict: !!options.strict, counts, durationMs, inputs: files };
    writeFileSync(join(output, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2) + '\n');
    writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    const headline = `Errors: ${counts.error}; warnings: ${counts.warning}; info: ${counts.info}`;
    writeFileSync(join(output, 'summary.md'), `# PCB intent validation: ${name}\n\n` +
        `Status: ${passed ? 'passed' : 'failed'}${options.strict ? ' (strict)' : ''}\n\n${headline}\n\n` +
        `Validation time: ${durationMs.toFixed(2)} ms\n\n` +
        'This report checks DSL intent; it does not certify final placement or routing.\n\n' +
        (diagnostics.length ? diagnostics.map(diagnostic => '- ' + formatDiagnostic(diagnostic)).join('\n') : 'No findings.') + '\n');
    console.log(`\nPCB intent validation: ${name} (${passed ? 'passed' : 'failed'})\n${headline}`);
    for (const diagnostic of diagnostics.slice(0, 24)) console.log('- ' + formatDiagnostic(diagnostic));
    if (diagnostics.length > 24) console.log(`... ${diagnostics.length - 24} more findings in diagnostics.json.`);
    console.log('Debug output: ' + output);
    return passed;
}

function usage(cases) {
    console.log('PCB validation fixtures:\n' + [...cases.keys()].join('\n'));
    console.log('\nRun: npm run debug:pcb-validation -- <fixture> [fixture ...]');
    console.log('Run every fixture: npm run debug:pcb-validation -- --all');
    console.log('Use files: npm run debug:pcb-validation -- --code placement.js --circuit circuit.json');
    console.log('Options: --list, --strict, --footprints <json>, --existing-placement <json>, --output-dir <directory>');
    console.log('Input file options can also override one fixture. Warnings fail only with --strict.');
}

try {
    const { values: options, positionals: names } = parseArgs({ options: {
        list: { type: 'boolean' }, all: { type: 'boolean' }, strict: { type: 'boolean' }, help: { type: 'boolean' },
        code: { type: 'string' }, circuit: { type: 'string' },
        footprints: { type: 'string' }, 'existing-placement': { type: 'string' }, 'output-dir': { type: 'string' },
    }, allowPositionals: true });
    const cases = fixtures();
    const hasFileOptions = ['code', 'circuit', ...Object.values(optionalInputs).map(([option]) => option)].some(key => options[key]);
    if (options.list || options.help || (!names.length && !options.all && !hasFileOptions)) usage(cases);
    else {
        if (options.all && names.length) throw Error('Use either fixture names or --all.');
        const selected = options.all ? [...cases.keys()] : names;
        if (hasFileOptions && selected.length > 1) throw Error('Input file options require a single fixture or a custom input.');
        if (!selected.length && (!options.code || !options.circuit)) throw Error('Custom input requires --code and --circuit.');
        for (const name of selected) if (!cases.has(name)) throw Error('Unknown PCB fixture: ' + name + '. Use --list.');
        const jobs = selected.length ? selected.map(name => [name, cases.get(name)]) : [[basename(options.code, '.js'), null]];
        let exitCode = 0;
        for (const [name, fixture] of jobs) {
            try {
                if (!capture(name, inputFiles(name, fixture, options), options)) exitCode = Math.max(exitCode, 1);
            } catch (error) {
                console.error('PCB validation failed for ' + name + ': ' + error.message);
                exitCode = 2;
            }
        }
        process.exitCode = exitCode;
    }
} catch (error) {
    console.error('PCB validation: ' + error.message);
    process.exitCode = 2;
}

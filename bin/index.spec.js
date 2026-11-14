const crossSpawn = require('cross-spawn');
const fs = require('fs');
const path = require('path');

describe('bin', () => {
    it('it should support minimal params', async () => {
        const result = crossSpawn.sync('node', [
            './bin/index.js',
            '--input',
            './test/spec/v3.json',
            '--output',
            './test/generated/bin',
        ]);
        expect(result.stdout.toString()).toBe('');
        expect(result.stderr.toString()).toBe('');
    });

    it('it should support all params', async () => {
        const result = crossSpawn.sync('node', [
            './bin/index.js',
            '--input',
            './test/spec/v3.json',
            '--output',
            './test/generated/bin',
            '--client',
            'fetch',
            '--useOptions',
            '--useUnionTypes',
            '--exportCore',
            'true',
            '--exportServices',
            'true',
            '--exportModels',
            'true',
            '--exportSchemas',
            'true',
            '--indent',
            '4',
            '--postfixServices',
            'Service',
            '--postfixModels',
            'Dto',
        ]);
        expect(result.stdout.toString()).toBe('');
        expect(result.stderr.toString()).toBe('');
    });

    it('shares one models directory between fetch and Angular clients', () => {
        fs.mkdirSync('./test/generated', { recursive: true });
        const output = fs.mkdtempSync('./test/generated/shared-models-');
        const generate = args => {
            const result = crossSpawn.sync('node', ['./bin/index.js', '--input', './test/spec/v3.json', ...args]);
            expect(result.stderr.toString()).toBe('');
            expect(result.status).toBe(0);
        };
        try {
            generate(['--output', output, '--exportCore', 'false', '--exportServices', 'false']);
            for (const client of ['fetch', 'angular']) {
                const target = path.join(output, client);
                generate([
                    '--output',
                    target,
                    '--client',
                    client,
                    '--exportModels',
                    'false',
                    '--modelsImportPath',
                    '../../models/',
                ]);
                expect(fs.existsSync(path.join(target, 'models'))).toBe(false);
                const services = path.join(target, 'services');
                let imports = 0;
                for (const file of fs.readdirSync(services)) {
                    const source = fs.readFileSync(path.join(services, file), 'utf8');
                    expect(source).not.toContain("from '../models/");
                    for (const match of source.matchAll(/from '(\.\.\/\.\.\/models\/[^']+)'/g)) {
                        expect(fs.existsSync(path.resolve(services, `${match[1]}.ts`))).toBe(true);
                        imports++;
                    }
                }
                expect(imports).toBeGreaterThan(0);
                expect(fs.readFileSync(path.join(target, 'index.ts'), 'utf8')).not.toContain("from './models/");
            }
        } finally {
            fs.rmSync(output, { recursive: true, force: true });
        }
    });

    it('it should throw error without params', async () => {
        const result = crossSpawn.sync('node', ['./bin/index.js']);
        expect(result.stdout.toString()).toBe('');
        expect(result.stderr.toString()).toContain(`error: required option '-i, --input <value>' not specified`);
    });

    it('it should throw error with wrong params', async () => {
        const result = crossSpawn.sync('node', [
            './bin/index.js',
            '--input',
            './test/spec/v3.json',
            '--output',
            './test/generated/bin',
            '--unknown',
        ]);
        expect(result.stdout.toString()).toBe('');
        expect(result.stderr.toString()).toContain(`error: unknown option '--unknown'`);
    });

    it('it should display help', async () => {
        const result = crossSpawn.sync('node', ['./bin/index.js', '--help']);
        expect(result.stdout.toString()).toContain(`Usage: openapi [options]`);
        expect(result.stdout.toString()).toContain(`-i, --input <value>`);
        expect(result.stdout.toString()).toContain(`-o, --output <value>`);
        expect(result.stderr.toString()).toBe('');
    });
});

import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(__dirname, '..');
const packageName = '@oronts/vendure-data-hub-plugin';
const packagePaths = [
    packageName,
    `${packageName}/sdk`,
    `${packageName}/shared`,
    `${packageName}/connectors`,
    `${packageName}/connectors/pimcore`,
] as const;
const commandOptions = { maxBuffer: 50 * 1024 * 1024 } as const;

function runtimeCheck(moduleSyntax: 'require' | 'import'): string {
    const checks = packagePaths.map(path => moduleSyntax === 'require'
        ? `assertModule(${JSON.stringify(path)}, require(${JSON.stringify(path)}));`
        : `assertModule(${JSON.stringify(path)}, await import(${JSON.stringify(path)}));`);
    return `
function assertModule(path, value) {
    if (!value || typeof value !== 'object' || Object.keys(value).length === 0) {
        throw new Error('Public package path has no runtime exports: ' + path);
    }
}
${checks.join('\n')}
`;
}

async function verifyPackage(): Promise<void> {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'data-hub-consumer-'));
    const consumerDirectory = join(temporaryRoot, 'consumer');
    try {
        const pack = await execFileAsync('npm', [
            'pack',
            '--json',
            '--ignore-scripts',
            '--pack-destination',
            temporaryRoot,
        ], { cwd: packageRoot, ...commandOptions });
        const packResult = JSON.parse(pack.stdout) as Array<{ filename?: string }>;
        const filename = packResult[0]?.filename;
        if (!filename) throw new Error('npm pack did not return a tarball filename');

        await mkdir(consumerDirectory);
        await writeFile(join(consumerDirectory, 'package.json'), JSON.stringify({
            name: 'data-hub-package-consumer',
            private: true,
            type: 'module',
        }, null, 2));

        await execFileAsync('npm', [
            'install',
            '--ignore-scripts',
            '--no-audit',
            '--no-fund',
            join(temporaryRoot, filename),
            'typescript@5.9.3',
        ], { cwd: consumerDirectory, ...commandOptions });

        await writeFile(join(consumerDirectory, 'consumer.cjs'), runtimeCheck('require'));
        await writeFile(join(consumerDirectory, 'consumer.mjs'), runtimeCheck('import'));
        await writeFile(join(consumerDirectory, 'consumer.ts'), `
import { DataHubPlugin, createPipeline } from '${packageName}';
import {
    createPipeline as createSdkPipeline,
    queueAdapterRegistry,
} from '${packageName}/sdk';
import type { QueueAdapter } from '${packageName}/sdk';
import type { PipelineDefinition } from '${packageName}/shared';
import { defineConnector } from '${packageName}/connectors';
import { PimcoreConnector } from '${packageName}/connectors/pimcore';

const plugin: typeof DataHubPlugin = DataHubPlugin;
const pipelineFactory: typeof createPipeline = createSdkPipeline;
const adapters: readonly QueueAdapter[] = queueAdapterRegistry.getAll();
type Definition = PipelineDefinition;
void plugin;
void pipelineFactory;
void adapters;
void (undefined as unknown as Definition);
void defineConnector;
void PimcoreConnector;
`);
        await writeFile(join(consumerDirectory, 'tsconfig.json'), JSON.stringify({
            compilerOptions: {
                module: 'Node16',
                moduleResolution: 'Node16',
                noEmit: true,
                // Vendure's supported TypeScript setup enables this because some
                // transitive framework declarations are not self-contained.
                skipLibCheck: true,
                strict: true,
                target: 'ES2020',
            },
            files: ['consumer.ts'],
        }, null, 2));

        await execFileAsync(process.execPath, ['consumer.cjs'], { cwd: consumerDirectory, ...commandOptions });
        await execFileAsync(process.execPath, ['consumer.mjs'], { cwd: consumerDirectory, ...commandOptions });
        await execFileAsync(
            join(consumerDirectory, 'node_modules', '.bin', 'tsc'),
            ['--project', 'tsconfig.json'],
            { cwd: consumerDirectory, ...commandOptions },
        );
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }
}

void verifyPackage();

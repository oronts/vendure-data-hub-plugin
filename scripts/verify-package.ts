import { execFile } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
const forbiddenPackagePaths = [
    'dist/dashboard/assets/',
    'dist/dashboard/index.html',
] as const;

interface PackResult {
    filename?: string;
    files?: Array<{ path: string }>;
}

interface RootPackageManifest {
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<
        string,
        { optional?: boolean }
    >;
}

async function getConsumerPeerSpecs(): Promise<string[]> {
    const manifest = JSON.parse(
        await readFile(join(packageRoot, 'package.json'), 'utf8'),
    ) as RootPackageManifest;
    const peerDependencies = manifest.peerDependencies ?? {};

    return Object.keys(peerDependencies)
        .filter(name => !manifest.peerDependenciesMeta?.[name]?.optional)
        .map(name => {
            const version = manifest.devDependencies?.[name];
            if (!version) {
                throw new Error(
                    `Required peer dependency is not installed for package verification: ${name}`,
                );
            }

            return `${name}@${version}`;
        });
}

function parsePackResults(output: string): PackResult[] {
    const lines = output.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (lines[index]?.trim() !== '[') continue;
        try {
            return JSON.parse(lines.slice(index).join('\n')) as PackResult[];
        } catch {
            continue;
        }
    }
    throw new Error('npm pack did not return a JSON result');
}

function assertPackageContents(packResult: PackResult): void {
    const paths = packResult.files?.map(file => file.path) ?? [];
    const forbiddenPath = paths.find(path => forbiddenPackagePaths.some(forbidden => (
        forbidden.endsWith('/') ? path.startsWith(forbidden) : path === forbidden
    )));
    if (forbiddenPath) {
        throw new Error(`Generated development dashboard asset entered the package: ${forbiddenPath}`);
    }
}

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
        const consumerPeerSpecs = await getConsumerPeerSpecs();
        const pack = await execFileAsync('npm', [
            'pack',
            '--json',
            '--pack-destination',
            temporaryRoot,
        ], { cwd: packageRoot, ...commandOptions });
        const packResult = parsePackResults(pack.stdout);
        const packageManifest = packResult[0];
        const filename = packageManifest?.filename;
        if (!filename) throw new Error('npm pack did not return a tarball filename');
        assertPackageContents(packageManifest);

        await mkdir(consumerDirectory);
        await writeFile(join(consumerDirectory, 'package.json'), JSON.stringify({
            name: 'data-hub-package-consumer',
            private: true,
            type: 'module',
        }, null, 2));

        await execFileAsync('npm', [
            'install',
            '--ignore-scripts',
            '--registry=https://registry.npmjs.org/',
            '--no-audit',
            '--no-fund',
            join(temporaryRoot, filename),
            'typescript@5.9.3',
            ...consumerPeerSpecs,
        ], { cwd: consumerDirectory, ...commandOptions });

        await access(join(
            consumerDirectory,
            'node_modules',
            packageName,
            'dist',
            'dashboard',
            'styles.css',
        ));
        await access(join(
            consumerDirectory,
            'node_modules',
            packageName,
            'dist',
            'dashboard',
            'i18n',
            'en.po',
        ));
        await access(join(
            consumerDirectory,
            'node_modules',
            packageName,
            'dist',
            'dashboard',
            'i18n',
            'de.po',
        ));

        await writeFile(join(consumerDirectory, 'consumer.cjs'), runtimeCheck('require'));
        await writeFile(join(consumerDirectory, 'consumer.mjs'), runtimeCheck('import'));
        await writeFile(join(consumerDirectory, 'consumer.ts'), `
import {
    DataHubPlugin,
    AutoMapperService,
    FieldMapperService,
    createPipeline,
} from '${packageName}';
import type {
    DataHubPluginOptions,
    MapperExecutionOptions,
    MapperFieldMapping,
} from '${packageName}';
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
const mapper = new FieldMapperService();
const mapperFields: MapperFieldMapping[] = [{ source: 'sku', target: 'code' }];
const mapperOptions: MapperExecutionOptions = {
    lookupTables: [],
};
const mapped = mapper.mapRecord({ sku: 'SKU-1' }, mapperFields, mapperOptions);
const autoMapper = new AutoMapperService();
autoMapper.setConfig({ confidenceThreshold: 0.8 });
const pimcore = PimcoreConnector({ connectionCode: 'pimcore-graphql' });
const pluginOptions: DataHubPluginOptions = {
    connectors: [pimcore],
    pipelines: pimcore.pipelines,
};
type Definition = PipelineDefinition;
void plugin;
void pipelineFactory;
void adapters;
void mapped;
void autoMapper;
void pluginOptions;
void (undefined as unknown as Definition);
void defineConnector;
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

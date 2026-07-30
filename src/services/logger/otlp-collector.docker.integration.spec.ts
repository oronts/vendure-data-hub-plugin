import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { OTLP_TELEMETRY } from '../../constants/defaults/telemetry-defaults';
import { DataHubLoggerFactory } from './datahub-logger';
import { OtlpExporterService } from './otlp-exporter.service';

const execFileAsync = promisify(execFile);
const dockerEnabled = process.env.DATAHUB_OTLP_DOCKER_TEST === '1';
const tlsDirectory = process.env.DATAHUB_OTLP_TLS_DIR?.trim();
const dockerDescribe = dockerEnabled ? describe : describe.skip;
const repositoryRoot = resolve(__dirname, '../../..');
const composeFile = join(
    repositoryRoot,
    'dev-server/infrastructure/docker-compose.otlp.yml',
);
const TEST_TIMEOUT_MS = 120_000;
const READINESS_TIMEOUT_MS = 30_000;
const OUTPUT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;

function requireTlsDirectory(): string {
    if (!tlsDirectory) {
        throw new Error('DATAHUB_OTLP_TLS_DIR is required for Collector TLS acceptance');
    }
    return tlsDirectory;
}

interface DockerCollector {
    endpoint: string;
    healthEndpoint: string;
    metricsPath: string;
    tracesPath: string;
    compose(...args: string[]): Promise<void>;
}

async function getAvailablePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolveListen);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Failed to allocate an OTLP test port');
    }
    await new Promise<void>((resolveClose, reject) => {
        server.close(error => error ? reject(error) : resolveClose());
    });
    return address.port;
}

async function waitFor(
    assertion: () => Promise<boolean>,
    timeoutMs: number,
    description: string,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await assertion()) {
            return;
        }
        await new Promise(resolvePoll => setTimeout(resolvePoll, POLL_INTERVAL_MS));
    }
    throw new Error(`Timed out waiting for ${description}`);
}

async function waitForHealth(healthEndpoint: string): Promise<void> {
    await waitFor(async () => {
        try {
            const response = await fetch(healthEndpoint);
            await response.body?.cancel();
            return response.ok;
        } catch {
            return false;
        }
    }, READINESS_TIMEOUT_MS, 'OpenTelemetry Collector health');
}

async function waitForFileText(
    path: string,
    expectedValues: readonly string[],
): Promise<string> {
    let contents = '';
    await waitFor(async () => {
        try {
            contents = await readFile(path, 'utf8');
            return expectedValues.every(value => contents.includes(value));
        } catch {
            return false;
        }
    }, OUTPUT_TIMEOUT_MS, `collector output ${path}`);
    return contents;
}

async function startDockerCollector(): Promise<{
    collector: DockerCollector;
    cleanup(): Promise<void>;
}> {
    const tlsDirectoryPath = requireTlsDirectory();
    const outputDirectory = await mkdtemp(join(tmpdir(), 'datahub-otlp-'));
    await chmod(outputDirectory, 0o750);
    const httpPort = await getAvailablePort();
    const healthPort = await getAvailablePort();
    const projectName = `datahub-otlp-${process.pid}`;
    const environment = {
        ...process.env,
        DATAHUB_OTLP_OUTPUT_DIR: outputDirectory,
        DATAHUB_OTLP_HTTP_PORT: String(httpPort),
        DATAHUB_OTLP_HEALTH_PORT: String(healthPort),
        DATAHUB_OTLP_UID: String(process.getuid?.() ?? 1000),
        DATAHUB_OTLP_GID: String(process.getgid?.() ?? 1000),
        DATAHUB_OTLP_TLS_DIR: tlsDirectoryPath,
    };
    const compose = async (...args: string[]) => {
        await execFileAsync('docker', [
            'compose',
            '--project-name',
            projectName,
            '--file',
            composeFile,
            ...args,
        ], {
            cwd: repositoryRoot,
            env: environment,
            timeout: TEST_TIMEOUT_MS,
        });
    };

    try {
        await compose('up', '--detach');
        await waitForHealth(`http://127.0.0.1:${healthPort}`);
    } catch (error) {
        await compose('logs', '--no-color').catch(() => undefined);
        await compose('down', '--volumes', '--remove-orphans').catch(() => undefined);
        await rm(outputDirectory, { recursive: true, force: true });
        throw error;
    }

    return {
        collector: {
            endpoint: `https://localhost:${httpPort}`,
            healthEndpoint: `http://127.0.0.1:${healthPort}`,
            metricsPath: join(outputDirectory, 'metrics.json'),
            tracesPath: join(outputDirectory, 'traces.json'),
            compose,
        },
        cleanup: async () => {
            try {
                await compose('down', '--volumes', '--remove-orphans');
            } finally {
                await rm(outputDirectory, { recursive: true, force: true });
            }
        },
    };
}

dockerDescribe('OTLP Collector Docker integration', () => {
    let collector: DockerCollector;
    let cleanup: (() => Promise<void>) | undefined;

    beforeAll(async () => {
        ({ collector, cleanup } = await startDockerCollector());
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
        await cleanup?.();
        vi.restoreAllMocks();
    }, TEST_TIMEOUT_MS);

    it('exports both signals over trusted TLS and recovers a retryable transport failure', async () => {
        const untrustedEnvironment = { ...process.env };
        delete untrustedEnvironment.NODE_EXTRA_CA_CERTS;
        const untrustedRequest = execFileAsync(process.execPath, [
            '-e',
            `fetch(${JSON.stringify(collector.endpoint)}).then(() => process.exit(0)).catch(() => process.exit(1))`,
        ], { env: untrustedEnvironment });
        await expect(untrustedRequest).rejects.toMatchObject({ code: 1 });

        const exporter = new OtlpExporterService({
            telemetry: {
                endpoint: collector.endpoint,
                serviceName: 'vendure-data-hub-docker-test',
                serviceVersion: '0.1.7',
                environment: 'collector-integration',
                requestTimeoutMs: 2_000,
                tls: { caFile: join(requireTlsDirectory(), 'server.crt') },
            },
        });
        const factory = new DataHubLoggerFactory(exporter);
        factory.getMetricsRegistry()
            .getCounter('datahub_collector_acceptance_total')
            .increment(7, { pipelineCode: 'collector-acceptance' });
        factory.createLogger('CollectorAcceptance', {
            pipelineCode: 'collector-acceptance',
        }).startSpan('datahub.collector.acceptance').end('ok');

        await exporter.flush();

        const metricsText = await waitForFileText(collector.metricsPath, [
            'datahub_collector_acceptance_total',
            'vendure-data-hub-docker-test',
            'collector-integration',
        ]);
        const tracesText = await waitForFileText(collector.tracesPath, [
            'datahub.collector.acceptance',
            'vendure-data-hub-docker-test',
            'collector-acceptance',
        ]);
        expect(metricsText.trim().split('\n').every(line => JSON.parse(line))).toBe(true);
        expect(tracesText.trim().split('\n').every(line => JSON.parse(line))).toBe(true);

        await collector.compose('stop', 'otel-collector');
        const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        const retryExporter = new OtlpExporterService({
            telemetry: {
                endpoint: collector.endpoint,
                requestTimeoutMs: 500,
                tls: { caFile: join(requireTlsDirectory(), 'server.crt') },
            },
        });
        const retryFactory = new DataHubLoggerFactory(retryExporter);
        retryFactory.getMetricsRegistry()
            .getCounter('datahub_collector_recovery_total')
            .increment(1);
        retryFactory.createLogger('CollectorAcceptance')
            .startSpan('datahub.collector.recovered').end('error');

        await retryExporter.flush();
        expect(stderr).toHaveBeenCalledWith(
            expect.stringContaining('datahub_otlp_export_failure'),
        );
        expect(await readFile(collector.metricsPath, 'utf8'))
            .not.toContain('datahub_collector_recovery_total');
        expect(await readFile(collector.tracesPath, 'utf8'))
            .not.toContain('datahub.collector.recovered');

        await collector.compose('start', 'otel-collector');
        await waitForHealth(collector.healthEndpoint);
        await new Promise(resolveRetry => setTimeout(
            resolveRetry,
            OTLP_TELEMETRY.INITIAL_RETRY_DELAY_MS
                * (1 + OTLP_TELEMETRY.RETRY_JITTER_RATIO)
                + 100,
        ));
        await retryExporter.flush();
        await Promise.all([
            waitForFileText(collector.metricsPath, ['datahub_collector_recovery_total']),
            waitForFileText(collector.tracesPath, ['datahub.collector.recovered']),
        ]);

        await Promise.all([
            exporter.onModuleDestroy(),
            retryExporter.onModuleDestroy(),
        ]);
    }, TEST_TIMEOUT_MS);
}, TEST_TIMEOUT_MS);

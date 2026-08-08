import { ChildProcess, fork } from 'node:child_process';
import { join } from 'node:path';
import {
    getMockEndpoint,
    MOCK_ROUTES,
    MockService,
} from './ports';

const MOCK_STARTUP_DEFAULTS = {
    timeoutMs: 15_000,
    pollIntervalMs: 100,
    requestTimeoutMs: 1_000,
    stopTimeoutMs: 5_000,
    forceStopTimeoutMs: 1_000,
} as const;

interface MockServerDefinition {
    readonly service: MockService;
    readonly file: string;
    readonly healthRoute: string;
}

interface RunningMockServer {
    readonly definition: MockServerDefinition;
    readonly child: ChildProcess;
}

export interface MockServerFailure {
    readonly file: string;
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
}

export const MOCK_SERVER_DEFINITIONS = [
    {
        service: 'PIMCORE',
        file: 'mock-pimcore-api.ts',
        healthRoute: MOCK_ROUTES.PIMCORE_HEALTH,
    },
    {
        service: 'MAGENTO',
        file: 'mock-magento-api.ts',
        healthRoute: MOCK_ROUTES.HEALTH,
    },
    {
        service: 'SHOPIFY',
        file: 'mock-shopify-api.ts',
        healthRoute: MOCK_ROUTES.HEALTH,
    },
    {
        service: 'EDGE_CASE',
        file: 'mock-edge-case-api.ts',
        healthRoute: MOCK_ROUTES.HEALTH,
    },
] as const satisfies readonly MockServerDefinition[];

function parsePositiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(durationMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, durationMs));
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) {
        return true;
    }

    return new Promise(resolve => {
        const onExit = () => {
            clearTimeout(timeout);
            resolve(true);
        };
        const timeout = setTimeout(() => {
            child.off('exit', onExit);
            resolve(false);
        }, timeoutMs);
        child.once('exit', onExit);
    });
}

async function stopChild(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }

    child.kill('SIGTERM');
    if (await waitForExit(child, MOCK_STARTUP_DEFAULTS.stopTimeoutMs)) {
        return;
    }

    child.kill('SIGKILL');
    await waitForExit(child, MOCK_STARTUP_DEFAULTS.forceStopTimeoutMs);
}

export class MockServerSupervisor {
    private readonly startupTimeoutMs = parsePositiveInteger(
        process.env.MOCK_STARTUP_TIMEOUT_MS,
        MOCK_STARTUP_DEFAULTS.timeoutMs,
    );
    private readonly requestTimeoutMs = parsePositiveInteger(
        process.env.MOCK_REQUEST_TIMEOUT_MS,
        MOCK_STARTUP_DEFAULTS.requestTimeoutMs,
    );
    private running: RunningMockServer[] = [];
    private stopping = false;

    constructor(
        private readonly mockDirectory: string,
        private readonly onUnexpectedExit: (failure: MockServerFailure) => void,
    ) {}

    async start(): Promise<void> {
        if (this.running.length > 0) {
            return;
        }

        this.stopping = false;
        this.running = MOCK_SERVER_DEFINITIONS.map(definition => {
            const fullPath = join(this.mockDirectory, definition.file);
            require.resolve(fullPath);
            const child = fork(fullPath, [], {
                execArgv: ['-r', 'ts-node/register'],
            });

            child.once('exit', (exitCode, signal) => {
                if (!this.stopping) {
                    this.onUnexpectedExit({
                        file: definition.file,
                        exitCode,
                        signal,
                    });
                }
            });

            return { definition, child };
        });

        try {
            await Promise.all(this.running.map(server => this.waitUntilReady(server)));
        } catch (error) {
            await this.stop();
            throw error;
        }
    }

    async stop(): Promise<void> {
        this.stopping = true;
        const running = this.running;
        this.running = [];

        await Promise.all(running.map(({ child }) => stopChild(child)));
    }

    private async waitUntilReady(server: RunningMockServer): Promise<void> {
        const { definition, child } = server;
        const healthUrl = getMockEndpoint(
            definition.service,
            definition.healthRoute,
        );
        const deadline = Date.now() + this.startupTimeoutMs;
        let lastFailure = 'no response';

        while (Date.now() < deadline) {
            if (child.exitCode !== null || child.signalCode !== null) {
                throw new Error(
                    `Mock server ${definition.file} exited before readiness`,
                );
            }

            try {
                const response = await fetch(healthUrl, {
                    signal: AbortSignal.timeout(this.requestTimeoutMs),
                });
                if (response.ok) {
                    return;
                }
                lastFailure = `HTTP ${response.status}`;
            } catch (error) {
                lastFailure = error instanceof Error ? error.message : String(error);
            }

            await delay(MOCK_STARTUP_DEFAULTS.pollIntervalMs);
        }

        throw new Error(
            `Mock server ${definition.file} was not ready at ${healthUrl}: ${lastFailure}`,
        );
    }
}

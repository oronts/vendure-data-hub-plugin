import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoaderAdapter, OperatorAdapter } from '../sdk/types';
import {
    clearRegistry,
    registerLoader,
    registerOperator,
} from '../adapters/registry';
import { DataHubRegistryService } from '../sdk/registry.service';
import { AdapterBootstrapService } from './initialization';

afterEach(() => {
    clearRegistry();
});

describe('AdapterBootstrapService module registry bridge', () => {
    it('bridges every executable adapter type as a runtime', async () => {
        const loader = {
            type: 'LOADER',
            code: 'bridged-loader',
            version: '1.0.0',
            apiVersion: 1,
            schema: { fields: [] },
            load: async () => ({ ok: 0, fail: 0, skipped: 0 }),
        } as unknown as LoaderAdapter<unknown>;
        const operator = {
            type: 'OPERATOR',
            code: 'bridged-operator',
            version: '1.0.0',
            apiVersion: 1,
            pure: true,
            schema: { fields: [] },
            apply: () => ({ records: [] }),
        } as unknown as OperatorAdapter<unknown>;
        registerLoader(loader);
        registerOperator(operator);

        const registry = new DataHubRegistryService();
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const service = new AdapterBootstrapService(
            { registerBuiltinAdapters: false } as never,
            registry,
            { registerCustomGenerator: vi.fn() } as never,
            { registerScript: vi.fn() } as never,
            { assertNonterminalRunsCompatible: vi.fn() } as never,
            { createLogger: vi.fn(() => logger) } as never,
        );

        await service.onModuleInit();

        expect(registry.getRuntime('LOADER', loader.code)).toBe(loader);
        expect(registry.getRuntime('OPERATOR', operator.code)).toBe(operator);
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Injector } from '@vendure/core';
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
            { get: vi.fn() } as never,
            { createLogger: vi.fn(() => logger) } as never,
        );

        await service.onModuleInit();

        expect(registry.getRuntime('LOADER', loader.code)).toBe(loader);
        expect(registry.getRuntime('OPERATOR', operator.code)).toBe(operator);
    });

    it('registers adapters created from dependency-injection factories', async () => {
        const loader = {
            type: 'LOADER',
            code: 'factory-loader',
            name: 'Factory loader',
            description: 'Factory loader',
            category: 'DATA_SOURCE',
            version: '1.0.0',
            apiVersion: 1,
            schema: { fields: [] },
            load: async () => ({ succeeded: 0, failed: 0 }),
        } as unknown as LoaderAdapter<unknown>;
        const moduleRef = { get: vi.fn() };
        const create = vi.fn(() => loader);
        const registry = new DataHubRegistryService();
        const service = new AdapterBootstrapService(
            {
                registerBuiltinAdapters: false,
                adapterFactories: [{ code: loader.code, definition: loader, create }],
            } as never,
            registry,
            { registerCustomGenerator: vi.fn() } as never,
            { registerScript: vi.fn() } as never,
            { assertNonterminalRunsCompatible: vi.fn() } as never,
            moduleRef as never,
            {
                createLogger: vi.fn(() => ({
                    debug: vi.fn(),
                    info: vi.fn(),
                    warn: vi.fn(),
                    error: vi.fn(),
                })),
            } as never,
        );

        await service.onModuleInit();

        expect(create).toHaveBeenCalledWith(expect.any(Injector));
        expect(registry.getRuntime('LOADER', loader.code)).toBe(loader);
    });

    it('skips invalid and failed factories without blocking valid adapters', async () => {
        const loader = {
            type: 'LOADER', code: 'valid-factory-loader', name: 'Valid loader',
            description: 'Valid loader', category: 'DATA_SOURCE', version: '1.0.0',
            apiVersion: 1, schema: { fields: [] },
            load: async () => ({ succeeded: 0, failed: 0 }),
        } as unknown as LoaderAdapter<unknown>;
        const logger = {
            debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
        };
        const registry = new DataHubRegistryService();
        const service = new AdapterBootstrapService(
            {
                registerBuiltinAdapters: false,
                adapterFactories: [
                    { code: 'throwing-factory', definition: loader, create: () => { throw new Error('factory failed'); } },
                    { code: 'invalid-factory', definition: loader, create: () => ({}) as never },
                    { code: loader.code, definition: loader, create: () => loader },
                ],
            } as never,
            registry,
            { registerCustomGenerator: vi.fn() } as never,
            { registerScript: vi.fn() } as never,
            { assertNonterminalRunsCompatible: vi.fn() } as never,
            { get: vi.fn() } as never,
            { createLogger: vi.fn(() => logger) } as never,
        );

        await expect(service.onModuleInit()).resolves.toBeUndefined();

        expect(registry.getRuntime('LOADER', loader.code)).toBe(loader);
        expect(logger.warn.mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
            'Failed to create custom adapter',
            'Adapter factory returned an invalid adapter',
        ]));
    });

    it('rejects factory metadata drift without exposing a definition-only adapter', async () => {
        const runtime = {
            type: 'LOADER', code: 'drifted-loader', name: 'Runtime name',
            description: 'Runtime description', category: 'DATA_SOURCE', version: '1.0.0',
            apiVersion: 1, schema: { fields: [] },
            load: async () => ({ succeeded: 0, failed: 0 }),
        } as unknown as LoaderAdapter<unknown>;
        const logger = {
            debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
        };
        const registry = new DataHubRegistryService();
        const service = new AdapterBootstrapService(
            {
                registerBuiltinAdapters: false,
                adapterFactories: [{
                    code: runtime.code,
                    definition: { ...runtime, name: 'Declared name' },
                    create: () => runtime,
                }],
            } as never,
            registry,
            { registerCustomGenerator: vi.fn() } as never,
            { registerScript: vi.fn() } as never,
            { assertNonterminalRunsCompatible: vi.fn() } as never,
            { get: vi.fn() } as never,
            { createLogger: vi.fn(() => logger) } as never,
        );

        await expect(service.onModuleInit()).resolves.toBeUndefined();

        expect(registry.getRuntime('LOADER', runtime.code)).toBeUndefined();
        expect(registry.find('LOADER', runtime.code)).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(
            'Failed to create custom adapter',
            expect.objectContaining({
                adapterFactoryCode: runtime.code,
                error: expect.stringContaining('metadata does not match'),
            }),
        );
    });
});

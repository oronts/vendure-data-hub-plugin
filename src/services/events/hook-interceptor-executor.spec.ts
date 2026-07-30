import { describe, expect, it, vi } from 'vitest';
import type { JsonObject } from '../../types';
import { HookInterceptorExecutor } from './hook-interceptor-executor';
import { HookScriptRegistryService } from './hook-script-registry.service';

function createExecutor() {
    const registry = new HookScriptRegistryService();
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
    };
    return {
        executor: new HookInterceptorExecutor(registry, logger as never),
        logger,
        registry,
    };
}

describe('HookInterceptorExecutor', () => {
    it('passes each transformed record set and context to the next action', async () => {
        const fixture = createExecutor();
        let capturedContext: { records?: readonly JsonObject[] } | undefined;
        const second = vi.fn((
            records: readonly JsonObject[],
            context: { records?: readonly JsonObject[] },
        ) => {
            capturedContext = structuredClone(context);
            return records.map(record => ({
                ...record,
                contextUpdated: context.records?.[0]?.normalized === true,
            }));
        });
        fixture.registry.register('normalize', records => records.map(record => ({
            ...record,
            normalized: true,
        })));
        fixture.registry.register('enrich', second);

        const result = await fixture.executor.execute([
            { type: 'SCRIPT', scriptName: 'normalize' },
            { type: 'SCRIPT', scriptName: 'enrich' },
        ], 'BEFORE_LOAD', [{ sku: 'SKU-1' }], 'run-1', 'pipeline-1');

        expect(second).toHaveBeenCalledWith(
            [{ sku: 'SKU-1', normalized: true }],
            expect.any(Object),
            undefined,
        );
        expect(capturedContext).toMatchObject({
            pipelineId: 'pipeline-1',
            runId: 'run-1',
            records: [{ sku: 'SKU-1', normalized: true }],
        });
        expect(result).toEqual({
            records: [{
                sku: 'SKU-1',
                normalized: true,
                contextUpdated: true,
            }],
            modified: true,
            errors: undefined,
        });
    });

    it('continues after a best-effort failure and stops on failOnError', async () => {
        const fixture = createExecutor();
        fixture.registry.register('valid', records => [...records]);

        await expect(fixture.executor.execute([
            { type: 'SCRIPT', name: 'missing', scriptName: 'missing' },
            { type: 'SCRIPT', scriptName: 'valid' },
        ], 'AFTER_TRANSFORM', [])).resolves.toEqual({
            records: [],
            modified: true,
            errors: [{
                action: 'missing',
                error: 'Script "missing" is not registered',
            }],
        });

        await expect(fixture.executor.execute([{
            type: 'SCRIPT',
            name: 'required',
            scriptName: 'missing',
            failOnError: true,
        }], 'AFTER_TRANSFORM', [])).rejects.toThrow(
            'Interceptor "required" failed: Script "missing" is not registered',
        );
    });

    it('isolates inline records and reuses compiled scripts', async () => {
        const fixture = createExecutor();
        const records = [{ sku: 'SKU-1' }];
        const action = {
            type: 'INTERCEPTOR' as const,
            code: 'records[0].sku = "CHANGED"; return records;',
        };

        const first = await fixture.executor.execute(
            [action],
            'BEFORE_TRANSFORM',
            records,
        );
        const second = await fixture.executor.execute(
            [action],
            'BEFORE_TRANSFORM',
            records,
        );

        expect(records).toEqual([{ sku: 'SKU-1' }]);
        expect(first.records).toEqual([{ sku: 'CHANGED' }]);
        expect(second.records).toEqual([{ sku: 'CHANGED' }]);
        expect(fixture.logger.debug).toHaveBeenCalledWith(
            'Script cache miss, compiling new script',
            { cacheSize: 0 },
        );
        expect(fixture.logger.debug).toHaveBeenCalledWith(
            'Script cache hit',
            { cacheSize: 1 },
        );
    });

    it('terminates CPU-bound inline code at the VM timeout', async () => {
        const fixture = createExecutor();

        const result = await fixture.executor.execute([{
            type: 'INTERCEPTOR',
            code: 'while (true) {}',
            timeout: 5,
        }], 'BEFORE_LOAD', []);

        expect(result.errors?.[0]?.error).toContain(
            'Script execution timed out after 5ms',
        );
    });
});

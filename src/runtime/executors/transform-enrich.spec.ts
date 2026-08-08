import { describe, expect, it, vi } from 'vitest';
import { StepType } from '../../constants/enums';
import type { LoaderRegistryService } from '../../loaders/registry';
import type { DataHubLoggerFactory } from '../../services/logger';
import type { JsonObject, PipelineStepDefinition } from '../../types';
import { EnrichmentConfigurationError, TransformExecutor } from './transform.executor';

function createExecutor(loaderRegistry?: Partial<LoaderRegistryService>): TransformExecutor {
    return new TransformExecutor(
        {
            createLogger: vi.fn(() => ({
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            })),
        } as unknown as DataHubLoggerFactory,
        undefined,
        undefined,
        loaderRegistry as LoaderRegistryService | undefined,
    );
}

function step(config: JsonObject): PipelineStepDefinition {
    return { key: 'enrich-records', type: StepType.ENRICH, config };
}

describe('TransformExecutor built-in enrichment', () => {
    it.each([
        [{ sourceType: 'API' }, 'sourceType'],
        [{ sourceType: 'HTTP' }, 'url'],
        [{ sourceType: 'VENDURE', entityType: 'PRODUCT' }, 'sourceField'],
    ])('fails malformed config %# instead of passing records through', async (config, reason) => {
        await expect(createExecutor().executeEnrich(
            {} as never,
            step(config),
            [{ id: 'record-1' }],
        )).rejects.toMatchObject({
            name: 'EnrichmentConfigurationError',
            stepKey: 'enrich-records',
            message: expect.stringContaining(reason),
        });
    });

    it('fails when Vendure enrichment has no loader registry', async () => {
        await expect(createExecutor().executeEnrich(
            {} as never,
            step({
                sourceType: 'VENDURE',
                entityType: 'PRODUCT',
                sourceField: 'sku',
                lookupField: 'sku',
            }),
            [{ sku: 'SKU-1' }],
        )).rejects.toBeInstanceOf(EnrichmentConfigurationError);
    });

    it('fails when no loader is registered for the configured entity', async () => {
        const executor = createExecutor({ get: vi.fn(() => undefined) });
        await expect(executor.executeEnrich(
            {} as never,
            step({
                sourceType: 'VENDURE',
                entityType: 'UNKNOWN',
                sourceField: 'sku',
                lookupField: 'sku',
            }),
            [{ sku: 'SKU-1' }],
        )).rejects.toThrow('No loader is registered');
    });

    it('applies static defaults, overwrites set values, and interpolates computed fields', async () => {
        const result = await createExecutor().executeEnrich(
            {} as never,
            step({
                defaults: { currency: 'EUR', enabled: true },
                set: { enabled: false },
                computed: { label: '${sku} - ${currency}' },
            }),
            [{ sku: 'SKU-1', currency: 'USD' }],
        );

        expect(result).toEqual([{
            sku: 'SKU-1',
            currency: 'USD',
            enabled: false,
            label: 'SKU-1 - USD',
        }]);
    });

    it('copies configured fields from a matched Vendure entity', async () => {
        const findExisting = vi.fn(async () => ({
            id: 7,
            entity: { id: 7, name: 'Matched product' },
        }));
        const executor = createExecutor({
            get: vi.fn(() => ({ findExisting } as never)),
        });

        await expect(executor.executeEnrich(
            {} as never,
            step({
                sourceType: 'VENDURE',
                entityType: 'PRODUCT',
                sourceField: 'sku',
                lookupField: 'sku',
                targetFields: { name: 'productName' },
            }),
            [{ sku: 'SKU-1' }],
        )).resolves.toEqual([{ sku: 'SKU-1', productName: 'Matched product' }]);
        expect(findExisting).toHaveBeenCalledWith(
            {},
            ['sku'],
            { sku: 'SKU-1' },
        );
    });
});

import { describe, expect, it, vi } from 'vitest';
import { StepType } from '../../constants/enums';
import type { ConnectionService } from '../../services/config/connection.service';
import type { SecretService } from '../../services/config/secret.service';
import type { DataHubLoggerFactory } from '../../services/logger';
import type { DataHubRegistryService } from '../../sdk/registry.service';
import type {
    EnricherAdapter,
    ValidatorAdapter,
} from '../../sdk/types';
import type { JsonObject, PipelineContext, PipelineStepDefinition } from '../../types';
import { TransformExecutor } from './transform.executor';

const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

function createExecutor(
    adapter: ValidatorAdapter<unknown> | EnricherAdapter<unknown>,
    secretService?: SecretService,
    connectionService?: ConnectionService,
): TransformExecutor {
    return new TransformExecutor(
        { createLogger: vi.fn(() => logger) } as unknown as DataHubLoggerFactory,
        { getRuntime: vi.fn(() => adapter) } as unknown as DataHubRegistryService,
        secretService,
        undefined,
        connectionService,
    );
}

describe('custom validation and enrichment runtimes', () => {
    it('dispatches a registered validator with the real execution context', async () => {
        const validate = vi.fn(async () => ({
            valid: [{ sku: 'SKU-1' }],
            invalid: [{
                record: { sku: '' },
                errors: [{ rule: 'required', message: 'SKU is required' }],
            }],
        }));
        const adapter = {
            type: 'VALIDATOR',
            code: 'catalog-validator',
            schema: { fields: [] },
            validate,
        } as ValidatorAdapter<unknown>;
        const executor = createExecutor(adapter);
        const onRecordError = vi.fn(async () => undefined);
        const pipelineContext = { channelIds: ['channel-1'] } as PipelineContext;
        const step: PipelineStepDefinition = {
            key: 'validate-catalog',
            type: StepType.VALIDATE,
            adapterCode: adapter.code,
            config: { errorHandlingMode: 'ACCUMULATE' },
        };

        await expect(executor.executeValidate(
            {} as never,
            step,
            [{ sku: 'SKU-1' }, { sku: '' }],
            onRecordError,
            pipelineContext,
            'pipeline-42',
        )).resolves.toEqual([{ sku: 'SKU-1' }]);

        expect(validate).toHaveBeenCalledWith(
            expect.objectContaining({
                pipelineId: 'pipeline-42',
                pipelineContext,
                stepKey: step.key,
                mode: 'ACCUMULATE',
            }),
            step.config,
            [{ sku: 'SKU-1' }, { sku: '' }],
        );
        expect(onRecordError).toHaveBeenCalledWith(
            step.key,
            'SKU is required',
            { sku: '' },
        );
    });

    it('makes secret and connection resolvers available to custom enrichers', async () => {
        const enrich = vi.fn(async context => {
            const apiKey = await context.secrets.getRequired('erp-key');
            const connection = await context.connections.getRequired('erp');
            return {
                records: [{ sku: 'SKU-1', apiKey, endpoint: connection.config.baseUrl }],
            };
        });
        const adapter = {
            type: 'ENRICHER',
            code: 'erp-enricher',
            schema: { fields: [] },
            enrich,
        } as EnricherAdapter<unknown>;
        const secretService = {
            resolve: vi.fn(async () => 'secret-value'),
        } as unknown as SecretService;
        const connectionService = {
            getRuntimeByCode: vi.fn(async () => ({
                code: 'erp',
                type: 'HTTP',
                config: { baseUrl: 'https://erp.internal' },
            })),
        } as unknown as ConnectionService;
        const executor = createExecutor(adapter, secretService, connectionService);
        const pipelineContext = { languageCode: 'de' } as PipelineContext;
        const step: PipelineStepDefinition = {
            key: 'enrich-catalog',
            type: StepType.ENRICH,
            adapterCode: adapter.code,
            config: { connectionCode: 'erp' },
        };

        await expect(executor.executeEnrich(
            {} as never,
            step,
            [{ sku: 'SKU-1' }],
            undefined,
            pipelineContext,
            'pipeline-84',
        )).resolves.toEqual([{
            sku: 'SKU-1',
            apiKey: 'secret-value',
            endpoint: 'https://erp.internal',
        }]);

        expect(enrich).toHaveBeenCalledWith(
            expect.objectContaining({
                pipelineId: 'pipeline-84',
                pipelineContext,
                stepKey: step.key,
            }),
            step.config,
            [{ sku: 'SKU-1' }],
        );
    });

    it('fails closed when adapter metadata has no executable runtime', async () => {
        const registry = {
            getRuntime: vi.fn(() => undefined),
        } as unknown as DataHubRegistryService;
        const executor = new TransformExecutor(
            { createLogger: vi.fn(() => logger) } as unknown as DataHubLoggerFactory,
            registry,
        );
        const step = {
            key: 'validate-catalog',
            type: StepType.VALIDATE,
            adapterCode: 'metadata-only',
            config: {} as JsonObject,
        } satisfies PipelineStepDefinition;

        await expect(executor.executeValidate(
            {} as never,
            step,
            [],
        )).rejects.toThrow(
            "Validator adapter 'metadata-only' is not registered for runtime execution",
        );
    });
});

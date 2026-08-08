import { describe, expect, it, vi } from 'vitest';
import type { SecretService } from '../../services/config/secret.service';
import type { AdapterLogger, OperatorContext } from '../../sdk/types';
import type { ExecutorContext } from '../executor-types';
import {
    createOperatorHelpers,
    createOptionalSecretResolver,
} from './transform-operator-helpers';

const adapterLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
} as AdapterLogger;

function createExecutorContext(): ExecutorContext {
    return {
        cpData: {
            transform: {
                __operatorCheckpoints: {
                    'single:custom': { cursor: 'before' },
                },
            },
        },
        cpDirty: false,
        markCheckpointDirty: vi.fn(),
    };
}

describe('transform operator helper contracts', () => {
    it('keeps utility and checkpoint behavior isolated per operator', async () => {
        const executorContext = createExecutorContext();
        const secretService = {
            resolve: vi.fn(async () => 'resolved-secret'),
        } as unknown as SecretService;
        const operatorContext = {
            ctx: {},
            pipelineId: 'pipeline-1',
            stepKey: 'transform',
            pipelineContext: {},
            logger: adapterLogger,
        } as OperatorContext;
        const helpers = createOperatorHelpers({
            ctx: {} as never,
            operatorContext,
            executorContext,
            operatorStateKey: 'single:custom',
            secretService,
        });
        const record = {
            sku: 'SKU-1',
            nested: { removable: true },
        };

        helpers.set(
            record,
            'nested.hash',
            helpers.crypto.hash('SKU-1'),
        );
        helpers.remove(record, 'nested.removable');
        helpers.setCheckpoint?.({ cursor: 'after' });

        expect(record).toEqual({
            sku: 'SKU-1',
            nested: {
                hash: '75bbb0f60c30207dda479ca30a7444f3b2f4a27a14157797ccc6635e6ed5f827',
            },
        });
        expect(helpers.checkpoint).toEqual({ cursor: 'before' });
        expect(helpers.convert.toMinorUnits(12.5)).toBe(1_250);
        expect(helpers.format.template('{{sku}}', record)).toBe('SKU-1');
        await expect(helpers.secrets?.get('api-key')).resolves.toBe(
            'resolved-secret',
        );
        expect(executorContext.cpData?.transform).toEqual({
            __operatorCheckpoints: {
                'single:custom': { cursor: 'after' },
            },
        });
        expect(executorContext.markCheckpointDirty).toHaveBeenCalledOnce();
    });

    it('keeps optional secret lookup failures non-fatal', async () => {
        const secretService = {
            resolve: vi.fn(async () => {
                throw new Error('secret backend unavailable');
            }),
        } as unknown as SecretService;
        const resolver = createOptionalSecretResolver(
            secretService,
            {} as never,
        );

        await expect(resolver?.get('api-key')).resolves.toBeUndefined();
    });
});

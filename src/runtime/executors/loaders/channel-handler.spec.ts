import { describe, expect, it, vi } from 'vitest';
import { CurrencyCode, LanguageCode } from '@vendure/common/lib/generated-types';
import { RequestContext } from '@vendure/core';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { PipelineStepDefinition } from '../../../types';
import { ChannelHandler } from './channel-handler';

function createHandler(updateResult: unknown) {
    const channelService = {
        findAll: vi.fn().mockResolvedValue({
            items: [{ id: 'channel-1', code: 'retail' }],
            totalItems: 1,
        }),
        update: vi.fn().mockResolvedValue(updateResult),
    };
    const zoneService = {
        findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
    };
    const loggerFactory = {
        createLogger: vi.fn().mockReturnValue({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
        }),
    } as unknown as DataHubLoggerFactory;

    return {
        channelService,
        handler: new ChannelHandler(
            channelService as never,
            zoneService as never,
            loggerFactory,
        ),
    };
}

const context = {
    channelId: 'channel-1',
} as RequestContext;

const step = {
    key: 'load-channels',
    type: 'LOAD',
    config: { adapterCode: 'channelUpsert' },
} as PipelineStepDefinition;

const record = {
    code: 'retail',
    defaultLanguageCode: LanguageCode.en,
    availableLanguageCodes: [LanguageCode.en],
    defaultCurrencyCode: CurrencyCode.EUR,
    availableCurrencyCodes: [CurrencyCode.EUR],
};

describe('ChannelHandler', () => {
    it('reports a rejected Vendure update as a failed record', async () => {
        const { handler, channelService } = createHandler({
            errorCode: 'CHANNEL_DEFAULT_LANGUAGE_ERROR',
            message: 'Default language is unavailable',
        });
        const onRecordError = vi.fn();

        await expect(handler.execute(
            context,
            step,
            [record],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(channelService.update).toHaveBeenCalledOnce();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-channels',
            'Failed to update channel: Default language is unavailable',
            record,
            expect.any(String),
        );
    });
});

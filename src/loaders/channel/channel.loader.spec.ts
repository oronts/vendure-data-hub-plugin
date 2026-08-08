import type { Channel, ChannelService, RequestContext, ZoneService } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { TARGET_OPERATION } from '../../constants';
import type { DataHubLoggerFactory } from '../../services/logger';
import type { LoaderContext } from '../../types';
import { ChannelLoader } from './channel.loader';
import type { ChannelInput } from './types';

const ctx = {} as RequestContext;
const existingChannel = {
    id: 'channel-1',
    code: 'retail',
    defaultLanguageCode: 'en',
    availableLanguageCodes: ['en'],
    defaultCurrencyCode: 'EUR',
    availableCurrencyCodes: ['EUR'],
} as Channel;

function createLoader() {
    const channelService = {
        findAll: vi.fn(async () => ({ items: [existingChannel], totalItems: 1 })),
        findOne: vi.fn(async () => existingChannel),
        update: vi.fn(async () => existingChannel),
    };
    const logger = {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
    };
    const loader = new ChannelLoader(
        channelService as unknown as ChannelService,
        {} as ZoneService,
        { createLogger: vi.fn(() => logger) } as unknown as DataHubLoggerFactory,
    );
    return { channelService, loader };
}

function createContext(): LoaderContext {
    return {
        ctx,
        pipelineId: 'pipeline-1',
        runId: 'run-1',
        operation: TARGET_OPERATION.UPDATE,
        lookupFields: ['code'],
        dryRun: false,
        options: { config: {} },
    };
}

async function update(loader: ChannelLoader, record: ChannelInput): Promise<void> {
    await (loader as unknown as {
        updateEntity(context: LoaderContext, channelId: string, input: ChannelInput): Promise<void>;
    }).updateEntity(createContext(), 'channel-1', record);
}

describe('ChannelLoader', () => {
    it('looks up channel codes from Vendure PaginatedList items', async () => {
        const { loader } = createLoader();

        await expect(loader.findExisting(ctx, ['code'], {
            code: 'retail',
            defaultLanguageCode: 'en',
            defaultCurrencyCode: 'EUR',
        })).resolves.toEqual({ id: existingChannel.id, entity: existingChannel });
    });

    it('preserves defaults and applies token and seller during updates', async () => {
        const { channelService, loader } = createLoader();

        await update(loader, {
            code: 'retail',
            token: 'retail-token',
            sellerId: 'seller-1',
            defaultLanguageCode: 'de',
            availableLanguageCodes: ['fr'],
            defaultCurrencyCode: 'USD',
            availableCurrencyCodes: ['GBP'],
        });

        expect(channelService.update).toHaveBeenCalledWith(ctx, expect.objectContaining({
            token: 'retail-token',
            sellerId: 'seller-1',
            availableLanguageCodes: ['de', 'fr'],
            availableCurrencyCodes: ['USD', 'GBP'],
        }));
    });

    it('propagates Vendure update error unions', async () => {
        const { channelService, loader } = createLoader();
        channelService.update.mockResolvedValueOnce({
            errorCode: 'LANGUAGE_NOT_AVAILABLE_ERROR',
            message: 'Language is unavailable',
        } as never);

        await expect(update(loader, {
            code: 'retail',
            defaultLanguageCode: 'de',
            defaultCurrencyCode: 'EUR',
        })).rejects.toThrow('Failed to update channel: Language is unavailable');
    });
});

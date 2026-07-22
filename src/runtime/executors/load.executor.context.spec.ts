import {
    CurrencyCode,
    LanguageCode,
    RequestContext,
} from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import {
    resolveBuiltInLoaderRequestContexts,
    resolveLoadAdapterSettings,
    resolveLoaderRequestContext,
} from './load.executor';

describe('resolveLoadAdapterSettings', () => {
    const ctx = { channelId: 'active-channel' } as RequestContext;

    it('passes pipeline channel and validation defaults to custom loaders', () => {
        expect(resolveLoadAdapterSettings(ctx, {}, {
            channelStrategy: 'MULTI',
            channelIds: ['channel-a', 'channel-b'],
            validationMode: 'LENIENT',
        })).toEqual({
            channelStrategy: 'MULTI',
            channels: ['channel-a', 'channel-b'],
            languageStrategy: 'FALLBACK',
            validationMode: 'LENIENT',
            conflictStrategy: 'SOURCE_WINS',
        });
    });

    it('uses load-step overrides before pipeline defaults', () => {
        expect(resolveLoadAdapterSettings(ctx, {
            channelStrategy: 'EXPLICIT',
            languageStrategy: 'SPECIFIC',
            validationMode: 'STRICT',
            conflictStrategy: 'MERGE',
        }, {
            channelStrategy: 'MULTI',
            channelIds: ['target-channel'],
            validationMode: 'LENIENT',
        })).toEqual({
            channelStrategy: 'EXPLICIT',
            channels: ['target-channel'],
            languageStrategy: 'SPECIFIC',
            validationMode: 'STRICT',
            conflictStrategy: 'MERGE',
        });
    });

    it('inherits the active channel and strict validation by default', () => {
        expect(resolveLoadAdapterSettings(ctx, {})).toEqual({
            channelStrategy: 'INHERIT',
            channels: ['active-channel'],
            languageStrategy: 'FALLBACK',
            validationMode: 'STRICT',
            conflictStrategy: 'SOURCE_WINS',
        });
    });
});

describe('resolveLoaderRequestContext', () => {
    function createSourceContext(): RequestContext {
        return new RequestContext({
            apiType: 'admin',
            channel: { id: 'channel-1', token: 'source-token' } as never,
            session: { user: { id: 'user-1' } } as never,
            languageCode: LanguageCode.en,
            currencyCode: CurrencyCode.USD,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });
    }

    it('uses the effective channel token and content language for built-in loaders', async () => {
        const source = createSourceContext();
        const resolved = new RequestContext({
            apiType: 'admin',
            channel: { id: 'channel-2', token: 'target-token' } as never,
            languageCode: LanguageCode.de,
            currencyCode: CurrencyCode.EUR,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });
        const requestContextService = {
            create: vi.fn().mockResolvedValue(resolved),
        };

        const result = await resolveLoaderRequestContext(
            requestContextService as never,
            source,
            { channel: 'target-token', contentLanguage: 'de' },
        );

        expect(requestContextService.create).toHaveBeenCalledWith({
            req: undefined,
            apiType: 'admin',
            channelOrToken: 'target-token',
            languageCode: LanguageCode.de,
        });
        expect(result.channelId).toBe('channel-2');
        expect(result.languageCode).toBe(LanguageCode.de);
        expect(result.session).toBe(source.session);
        expect(result.activeUserId).toBe('user-1');
    });

    it('reuses the current request context when no override is needed', async () => {
        const source = createSourceContext();
        const requestContextService = { create: vi.fn() };

        await expect(resolveLoaderRequestContext(
            requestContextService as never,
            source,
        )).resolves.toBe(source);
        expect(requestContextService.create).not.toHaveBeenCalled();
    });

    it('uses the resolved target channel as the custom-loader channel fallback', async () => {
        const target = { channelId: 'channel-2' } as RequestContext;

        expect(resolveLoadAdapterSettings(target, {}, {
            channel: 'target-token',
        })).toMatchObject({
            channelStrategy: 'INHERIT',
            channels: ['channel-2'],
        });
    });
});

describe('resolveBuiltInLoaderRequestContexts', () => {
    const source = new RequestContext({
        apiType: 'admin',
        channel: { id: 'channel-source', token: 'source-token' } as never,
        languageCode: LanguageCode.en,
        currencyCode: CurrencyCode.USD,
        isAuthorized: true,
        authorizedAsOwnerOnly: false,
    });
    const channels = [
        {
            id: 'channel-a',
            token: 'token-a',
            code: 'channel-a',
            defaultLanguageCode: LanguageCode.en,
            defaultCurrencyCode: CurrencyCode.USD,
            availableLanguageCodes: [LanguageCode.en],
            availableCurrencyCodes: [CurrencyCode.USD],
        },
        {
            id: 'channel-b',
            token: 'token-b',
            code: 'channel-b',
            defaultLanguageCode: LanguageCode.en,
            defaultCurrencyCode: CurrencyCode.EUR,
            availableLanguageCodes: [LanguageCode.en],
            availableCurrencyCodes: [CurrencyCode.EUR],
        },
    ];

    it('creates one preserved request context per explicit channel ID', async () => {
        const requestContextService = {
            create: vi.fn(async ({ channelOrToken, languageCode }: {
                channelOrToken: typeof channels[number];
                languageCode?: LanguageCode;
            }) => new RequestContext({
                apiType: 'admin',
                channel: channelOrToken as never,
                languageCode,
                currencyCode: channelOrToken.defaultCurrencyCode,
                isAuthorized: true,
                authorizedAsOwnerOnly: false,
            })),
        };
        const channelService = {
            findOne: vi.fn(async (_ctx: RequestContext, id: string) => (
                channels.find(channel => channel.id === id)
            )),
        };

        const result = await resolveBuiltInLoaderRequestContexts(
            requestContextService as never,
            channelService as never,
            source,
            {
                channelStrategy: 'MULTI',
                channelIds: ['channel-a', 'channel-b'],
                contentLanguage: 'en',
            },
        );

        expect(result.map(context => context.channelId)).toEqual(['channel-a', 'channel-b']);
        expect(channelService.findOne).toHaveBeenCalledTimes(2);
    });

    it('rejects missing configured channel IDs', async () => {
        await expect(resolveBuiltInLoaderRequestContexts(
            {} as never,
            { findOne: vi.fn() } as never,
            source,
            { channelStrategy: 'EXPLICIT', channelIds: ['missing'] },
        )).rejects.toThrow('Channel not found: missing');
    });
});

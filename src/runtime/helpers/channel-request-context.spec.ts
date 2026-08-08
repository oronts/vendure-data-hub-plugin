import { CurrencyCode, LanguageCode } from '@vendure/common/lib/generated-types';
import { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import {
    createChannelCodeRequestContext,
    createChannelRequestContext,
} from './channel-request-context';

describe('createChannelRequestContext', () => {
    it('resolves loader channel codes before creating the Vendure context', async () => {
        const source = new RequestContext({
            apiType: 'admin',
            channel: {
                id: 'channel-1',
                code: '__default_channel__',
                token: 'generated-default-token',
            } as never,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });
        const targetChannel = {
            id: 'channel-2',
            code: 'uk-store',
            token: 'generated-uk-token',
        };
        const resolved = new RequestContext({
            apiType: 'admin',
            channel: targetChannel as never,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });
        const requestContextService = {
            create: vi.fn().mockResolvedValue(resolved),
        };
        const channelService = {
            findAll: vi.fn().mockResolvedValue({
                items: [targetChannel],
                totalItems: 1,
            }),
        };

        const result = await createChannelCodeRequestContext(
            requestContextService as never,
            channelService as never,
            source,
            'uk-store',
        );

        expect(channelService.findAll).toHaveBeenCalledWith(source, {
            filter: { code: { eq: 'uk-store' } },
            take: 1,
        });
        expect(requestContextService.create).toHaveBeenCalledWith(
            expect.objectContaining({ channelOrToken: targetChannel }),
        );
        expect(result.channelId).toBe('channel-2');
    });

    it('reuses the active channel when its code matches', async () => {
        const source = new RequestContext({
            apiType: 'admin',
            channel: {
                id: 'channel-1',
                code: '__default_channel__',
                token: 'generated-default-token',
            } as never,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });
        const requestContextService = {
            create: vi.fn().mockResolvedValue(source),
        };
        const channelService = { findAll: vi.fn() };

        await createChannelCodeRequestContext(
            requestContextService as never,
            channelService as never,
            source,
            '__default_channel__',
        );

        expect(channelService.findAll).not.toHaveBeenCalled();
        expect(requestContextService.create).toHaveBeenCalledWith(
            expect.objectContaining({ channelOrToken: source.channel }),
        );
    });

    it('rejects an unknown loader channel code', async () => {
        const source = new RequestContext({
            apiType: 'admin',
            channel: { id: 'channel-1', code: '__default_channel__' } as never,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });

        await expect(createChannelCodeRequestContext(
            { create: vi.fn() } as never,
            { findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }) } as never,
            source,
            'missing',
        )).rejects.toThrow('Channel code not found: missing');
    });

    it('preserves identity, authorization, replication, and transaction state', async () => {
        const session = { user: { id: 'user-1' } };
        const source = new RequestContext({
            apiType: 'admin',
            channel: { id: 'channel-1', token: 'source' } as never,
            session: session as never,
            languageCode: LanguageCode.en,
            currencyCode: CurrencyCode.USD,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });
        source.setReplicationMode('master');
        const transactionKey = Symbol('TRANSACTION_MANAGER');
        const transactionManager = { id: 'transaction-1' };
        Object.defineProperty(source, transactionKey, { value: transactionManager });

        const resolved = new RequestContext({
            apiType: 'admin',
            channel: {
                id: 'channel-2',
                token: 'target',
                code: 'target',
                availableLanguageCodes: [LanguageCode.de],
                availableCurrencyCodes: [CurrencyCode.EUR],
            } as never,
            languageCode: LanguageCode.de,
            currencyCode: CurrencyCode.EUR,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });
        const requestContextService = {
            create: vi.fn().mockResolvedValue(resolved),
        };

        const result = await createChannelRequestContext(
            requestContextService as never,
            source,
            'target',
            LanguageCode.de,
            CurrencyCode.EUR,
        );

        expect(requestContextService.create).toHaveBeenCalledWith({
            req: undefined,
            apiType: 'admin',
            channelOrToken: 'target',
            languageCode: LanguageCode.de,
            currencyCode: CurrencyCode.EUR,
        });
        expect(result.channelId).toBe('channel-2');
        expect(result.session).toBe(session);
        expect(result.activeUserId).toBe('user-1');
        expect(result.isAuthorized).toBe(true);
        expect(result.languageCode).toBe(LanguageCode.de);
        expect(result.currencyCode).toBe(CurrencyCode.EUR);
        expect(result.replicationMode).toBe('master');
        expect(Reflect.get(result, transactionKey)).toBe(transactionManager);
    });

    it('rejects a content language unavailable in the target channel', async () => {
        const source = new RequestContext({
            apiType: 'admin',
            channel: { id: 'channel-1', token: 'source' } as never,
            languageCode: LanguageCode.en,
            currencyCode: CurrencyCode.USD,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });
        const resolved = new RequestContext({
            apiType: 'admin',
            channel: {
                id: 'channel-2',
                token: 'target',
                code: 'target',
                availableLanguageCodes: [LanguageCode.en],
            } as never,
            languageCode: LanguageCode.de,
            currencyCode: CurrencyCode.EUR,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });

        await expect(createChannelRequestContext(
            { create: vi.fn().mockResolvedValue(resolved) } as never,
            source,
            'target',
            LanguageCode.de,
        )).rejects.toThrow('Language de is not available in channel target');
    });

    it('rejects a currency unavailable in the target channel', async () => {
        const source = new RequestContext({
            apiType: 'admin',
            channel: { id: 'channel-1', token: 'source' } as never,
            languageCode: LanguageCode.en,
            currencyCode: CurrencyCode.USD,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });
        const resolved = new RequestContext({
            apiType: 'admin',
            channel: {
                id: 'channel-2',
                token: 'target',
                code: 'target',
                availableLanguageCodes: [LanguageCode.en],
                availableCurrencyCodes: [CurrencyCode.USD],
            } as never,
            languageCode: LanguageCode.en,
            currencyCode: CurrencyCode.EUR,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });

        await expect(createChannelRequestContext(
            { create: vi.fn().mockResolvedValue(resolved) } as never,
            source,
            'target',
            undefined,
            CurrencyCode.EUR,
        )).rejects.toThrow('Currency EUR is not available in channel target');
    });
});

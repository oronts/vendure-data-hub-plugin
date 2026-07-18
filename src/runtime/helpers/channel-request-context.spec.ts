import { CurrencyCode, LanguageCode } from '@vendure/common/lib/generated-types';
import { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { createChannelRequestContext } from './channel-request-context';

describe('createChannelRequestContext', () => {
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
            channel: { id: 'channel-2', token: 'target' } as never,
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
        );

        expect(requestContextService.create).toHaveBeenCalledWith({
            req: undefined,
            apiType: 'admin',
            channelOrToken: 'target',
            languageCode: LanguageCode.de,
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
});

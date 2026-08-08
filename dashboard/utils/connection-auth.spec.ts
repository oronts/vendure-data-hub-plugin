import { describe, expect, it } from 'vitest';
import { ConnectionAuthType } from '../../shared/types';
import {
    filterSupportedConnectionAuthOptions,
    isSupportedConnectionAuthType,
} from './connection-auth';

describe('connection auth capabilities', () => {
    it('advertises only modes implemented by applyAuthentication', () => {
        const options = Object.values(ConnectionAuthType).map(value => ({ value }));
        expect(filterSupportedConnectionAuthOptions(options).map(option => option.value)).toEqual([
            ConnectionAuthType.NONE,
            ConnectionAuthType.BASIC,
            ConnectionAuthType.BEARER,
            ConnectionAuthType.API_KEY,
        ]);
    });

    it('rejects stored unsupported modes', () => {
        expect(isSupportedConnectionAuthType(ConnectionAuthType.OAUTH2)).toBe(false);
        expect(isSupportedConnectionAuthType(ConnectionAuthType.HMAC)).toBe(false);
        expect(isSupportedConnectionAuthType(ConnectionAuthType.JWT)).toBe(false);
    });
});

import { describe, expect, it } from 'vitest';
import { hasHttpHeaderName, renameHttpHeader } from './http-header-rows';

describe('HTTP header records', () => {
    it('renames a header without changing its value or order', () => {
        expect(renameHttpHeader({
            Accept: 'application/json',
            'X-Request-Id': 'request-1',
        }, 'Accept', ' Content-Type ')).toEqual({
            'Content-Type': 'application/json',
            'X-Request-Id': 'request-1',
        });
    });

    it('detects duplicate names case-insensitively', () => {
        expect(hasHttpHeaderName({ Accept: 'application/json' }, 'accept'))
            .toBe(true);
        expect(hasHttpHeaderName({ Accept: 'application/json' }, 'Content-Type'))
            .toBe(false);
    });

    it('excludes the current header while validating a rename', () => {
        const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        };

        expect(hasHttpHeaderName(headers, 'accept', 'Accept')).toBe(false);
        expect(hasHttpHeaderName(headers, 'content-type', 'Accept')).toBe(true);
    });
});

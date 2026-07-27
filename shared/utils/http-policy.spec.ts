import { describe, expect, it } from 'vitest';
import {
    getHttpHeaderNameError,
    getHttpUrlValidationError,
} from './http-policy';

describe('HTTP policy', () => {
    it('accepts credential-free HTTP URLs only', () => {
        expect(getHttpUrlValidationError('https://example.com/api')).toBeNull();
        expect(getHttpUrlValidationError('ftp://example.com')).toBe('PROTOCOL');
        expect(getHttpUrlValidationError('not-a-url')).toBe('INVALID');
        expect(getHttpUrlValidationError('https://user:secret@example.com')).toBe('CREDENTIALS');
    });

    it('distinguishes static credential headers from authentication headers', () => {
        expect(getHttpHeaderNameError('Accept', 'STATIC')).toBeNull();
        expect(getHttpHeaderNameError('Authorization', 'STATIC')).toBe('RESTRICTED');
        expect(getHttpHeaderNameError('Authorization', 'AUTHENTICATION')).toBeNull();
        expect(getHttpHeaderNameError('Host', 'AUTHENTICATION')).toBe('RESTRICTED');
        expect(getHttpHeaderNameError('bad header', 'STATIC')).toBe('INVALID');
    });
});

import { describe, expect, it } from 'vitest';
import { FILE_STORAGE } from '../../constants/index';
import {
    resolveFileListLimit,
    resolveFileListOffset,
    resolveFilePreviewRows,
    resolveUploadExpiry,
} from './file-upload.config';

describe('resolveUploadExpiry', () => {
    it('uses the temporary upload default when expiry is omitted', () => {
        expect(resolveUploadExpiry(undefined)).toBe(FILE_STORAGE.EXPIRY_MINUTES);
        expect(resolveUploadExpiry({})).toBe(FILE_STORAGE.EXPIRY_MINUTES);
    });

    it('allows an explicitly persistent upload', () => {
        expect(resolveUploadExpiry({ persistent: true })).toBeUndefined();
        expect(resolveUploadExpiry({ persistent: 'true' })).toBeUndefined();
    });

    it('accepts exact integer expiry values from JSON and multipart bodies', () => {
        expect(resolveUploadExpiry({ expiresInMinutes: 90 })).toBe(90);
        expect(resolveUploadExpiry({ expiresInMinutes: '90' })).toBe(90);
    });

    it.each([0, 90.9, '1.5', '10junk', true, null])(
        'rejects malformed expiry value %j',
        value => {
            expect(() => resolveUploadExpiry({ expiresInMinutes: value }))
                .toThrow(`expiresInMinutes must be an integer from 1 to ${FILE_STORAGE.MAX_EXPIRY_MINUTES}`);
        },
    );

    it('rejects oversized expiry and conflicting persistence settings', () => {
        expect(() => resolveUploadExpiry({
            expiresInMinutes: FILE_STORAGE.MAX_EXPIRY_MINUTES + 1,
        })).toThrow('expiresInMinutes must be an integer');
        expect(() => resolveUploadExpiry({ persistent: true, expiresInMinutes: 60 }))
            .toThrow('persistent and expiresInMinutes cannot be used together');
        expect(() => resolveUploadExpiry({ persistent: 'yes' }))
            .toThrow('persistent must be true or false');
    });
});

describe('file query limits', () => {
    it('uses documented defaults and accepts exact bounds', () => {
        expect(resolveFileListLimit()).toBe(20);
        expect(resolveFileListOffset()).toBe(0);
        expect(resolveFilePreviewRows()).toBe(10);
        expect(resolveFileListLimit('500')).toBe(500);
        expect(resolveFileListOffset('10000')).toBe(10000);
        expect(resolveFilePreviewRows('1')).toBe(1);
    });

    it.each(['', '-1', '1.5', '10junk', 'Infinity'])('rejects malformed query value %j', value => {
        expect(() => resolveFileListLimit(value)).toThrow('limit must be an integer');
        expect(() => resolveFileListOffset(value)).toThrow('offset must be an integer');
        expect(() => resolveFilePreviewRows(value)).toThrow('rows must be an integer');
    });
});

import { describe, expect, it } from 'vitest';
import { FILE_STORAGE } from '../../constants/index';
import { resolveUploadExpiry } from './file-upload.config';

describe('resolveUploadExpiry', () => {
    it('uses the temporary upload default for missing or invalid values', () => {
        expect(resolveUploadExpiry(undefined)).toBe(FILE_STORAGE.EXPIRY_MINUTES);
        expect(resolveUploadExpiry({ expiresInMinutes: 0 })).toBe(FILE_STORAGE.EXPIRY_MINUTES);
        expect(resolveUploadExpiry({ expiresInMinutes: 'invalid' })).toBe(FILE_STORAGE.EXPIRY_MINUTES);
    });

    it('allows an explicitly persistent upload', () => {
        expect(resolveUploadExpiry({ persistent: true })).toBeUndefined();
        expect(resolveUploadExpiry({ persistent: 'true' })).toBeUndefined();
    });

    it('normalizes valid values and clamps the maximum', () => {
        expect(resolveUploadExpiry({ expiresInMinutes: 90.9 })).toBe(90);
        expect(resolveUploadExpiry({
            expiresInMinutes: FILE_STORAGE.MAX_EXPIRY_MINUTES + 1,
        })).toBe(FILE_STORAGE.MAX_EXPIRY_MINUTES);
    });
});

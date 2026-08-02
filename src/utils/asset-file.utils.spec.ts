import { describe, expect, it } from 'vitest';
import { extractFilenameFromUrl, getAssetMimeType } from './asset-file.utils';

describe('asset file URL helpers', () => {
    it('infers filename and MIME type from the pathname of signed URLs', () => {
        const url = 'https://cdn.example.com/catalog/photo.webp?X-Amz-Signature=secret.value';

        expect(extractFilenameFromUrl(url)).toBe('photo.webp');
        expect(getAssetMimeType(url)).toBe('image/webp');
    });

    it('uses the binary fallback for invalid or extensionless URLs', () => {
        expect(getAssetMimeType('not a URL')).toBe('application/octet-stream');
        expect(getAssetMimeType('https://cdn.example.com/download')).toBe('application/octet-stream');
    });

    it('creates stable collision-resistant fallback names without exposing the URL', () => {
        const firstUrl = 'https://cdn.example.com/?signature=secret-one';
        const secondUrl = 'https://cdn.example.com/?signature=secret-two';
        const firstName = extractFilenameFromUrl(firstUrl);

        expect(firstName).toMatch(/^asset-[a-f0-9]{16}$/);
        expect(extractFilenameFromUrl(firstUrl)).toBe(firstName);
        expect(extractFilenameFromUrl(secondUrl)).not.toBe(firstName);
        expect(firstName).not.toContain('secret');
    });
});

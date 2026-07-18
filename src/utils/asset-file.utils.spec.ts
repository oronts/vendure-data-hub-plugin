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
});

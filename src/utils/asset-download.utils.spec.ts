import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HTTP } from '../../shared/constants';
import { secureFetch } from './secure-fetch.utils';
import { sleep } from './retry.utils';
import { downloadAsset } from './asset-download.utils';

vi.mock('./secure-fetch.utils', () => ({
    secureFetch: vi.fn(),
}));

vi.mock('./retry.utils', () => ({
    sleep: vi.fn().mockResolvedValue(undefined),
}));

describe('downloadAsset', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns a bounded response body as a buffer', async () => {
        vi.mocked(secureFetch).mockResolvedValue(new Response('asset-data'));

        await expect(downloadAsset('https://assets.example.com/image.jpg')).resolves.toEqual(
            Buffer.from('asset-data'),
        );
        expect(secureFetch).toHaveBeenCalledTimes(1);
    });

    it('retries failed responses and cancels each response body', async () => {
        const cancel = vi.fn().mockResolvedValue(undefined);
        vi.mocked(secureFetch).mockImplementation(async () => ({
            ok: false,
            body: { cancel },
        }) as unknown as Response);

        await expect(downloadAsset('https://assets.example.com/missing.jpg')).resolves.toBeNull();
        expect(secureFetch).toHaveBeenCalledTimes(HTTP.MAX_RETRIES + 1);
        expect(sleep).toHaveBeenCalledTimes(HTTP.MAX_RETRIES);
        expect(cancel).toHaveBeenCalledTimes(HTTP.MAX_RETRIES + 1);
    });

    it('does not issue a request for an empty URL', async () => {
        await expect(downloadAsset('   ')).resolves.toBeNull();
        expect(secureFetch).not.toHaveBeenCalled();
    });
});

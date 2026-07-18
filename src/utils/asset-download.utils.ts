import { HTTP } from '../../shared/constants';
import { OUTBOUND_RESPONSE_LIMITS } from '../constants/defaults';
import { sleep } from './retry.utils';
import { secureFetch } from './secure-fetch.utils';
import { readResponseArrayBuffer } from './secure-response-body.utils';

export async function downloadAsset(url: string, context = 'Asset download'): Promise<Buffer | null> {
    if (!url.trim()) {
        return null;
    }

    for (let attempt = 0; attempt <= HTTP.MAX_RETRIES; attempt++) {
        try {
            const response = await secureFetch(url, {
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            });
            if (!response.ok) {
                await response.body?.cancel();
                if (attempt === HTTP.MAX_RETRIES) {
                    return null;
                }
                await sleep(HTTP.RETRY_DELAY_MS * (attempt + 1));
                continue;
            }

            const body = await readResponseArrayBuffer(response, {
                maxBytes: OUTBOUND_RESPONSE_LIMITS.ASSET_DOWNLOAD_BYTES,
                context,
            });
            return Buffer.from(body);
        } catch {
            if (attempt === HTTP.MAX_RETRIES) {
                return null;
            }
            await sleep(HTTP.RETRY_DELAY_MS * (attempt + 1));
        }
    }

    return null;
}

import { describe, expect, it, vi } from 'vitest';
import { OUTBOUND_RESPONSE_LIMITS } from '../../constants/defaults';
import { ResponseBodyTooLargeError } from '../../utils/secure-response-body.utils';
import { buildHttpResponse } from './response-parser';

describe('buildHttpResponse', () => {
    it('parses a bounded JSON response', async () => {
        const response = new Response('{"items":[{"id":"1"}]}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });

        await expect(buildHttpResponse(response)).resolves.toMatchObject({
            status: 200,
            data: { items: [{ id: '1' }] },
        });
    });

    it('rejects and cancels an oversized extractor response before reading it', async () => {
        const cancel = vi.fn();
        const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
            headers: {
                'content-length': String(OUTBOUND_RESPONSE_LIMITS.CONNECTOR_EXTRACT_BYTES + 1),
            },
        });

        await expect(buildHttpResponse(response)).rejects.toBeInstanceOf(ResponseBodyTooLargeError);
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('keeps malformed JSON diagnostics bounded to the consumed response', async () => {
        const response = new Response('not-json');

        await expect(buildHttpResponse(response)).rejects.toThrow(
            'Expected JSON response but got: not-json',
        );
    });
});

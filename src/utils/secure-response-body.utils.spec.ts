import { describe, expect, it, vi } from 'vitest';
import {
    readResponseArrayBuffer,
    readResponseJson,
    readResponseText,
    ResponseBodyTooLargeError,
} from './secure-response-body.utils';

describe('secure response body reader', () => {
    it('accepts a streamed body exactly at the configured limit', async () => {
        const response = new Response('12345678');

        await expect(readResponseText(response, { maxBytes: 8 })).resolves.toBe('12345678');
    });

    it('rejects and cancels a body whose declared length exceeds the limit', async () => {
        const cancel = vi.fn();
        const stream = new ReadableStream<Uint8Array>({ cancel });
        const response = new Response(stream, { headers: { 'content-length': '1025' } });

        await expect(readResponseText(response, {
            maxBytes: 1024,
            context: 'Connector error response',
        })).rejects.toMatchObject({
            name: 'ResponseBodyTooLargeError',
            maxBytes: 1024,
            receivedBytes: 1025,
        });
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('enforces the streamed byte count when Content-Length is underreported', async () => {
        const cancel = vi.fn();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(6));
                controller.enqueue(new Uint8Array(6));
            },
            cancel,
        });
        const response = new Response(stream, { headers: { 'content-length': '4' } });

        await expect(readResponseText(response, { maxBytes: 10 })).rejects.toBeInstanceOf(
            ResponseBodyTooLargeError,
        );
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('parses bounded JSON without delegating to unbounded response helpers', async () => {
        const response = new Response('{"items":[1,2,3]}');

        await expect(readResponseJson<{ items: number[] }>(response, { maxBytes: 64 }))
            .resolves.toEqual({ items: [1, 2, 3] });
    });

    it('returns an exact ArrayBuffer view', async () => {
        const response = new Response(new Uint8Array([1, 2, 3]));

        const buffer = await readResponseArrayBuffer(response, { maxBytes: 3 });
        expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3]);
    });

    it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
        'rejects invalid byte limit %s',
        async maxBytes => {
            await expect(readResponseText(new Response('x'), { maxBytes })).rejects.toThrow(
                'positive safe integer',
            );
        },
    );
});

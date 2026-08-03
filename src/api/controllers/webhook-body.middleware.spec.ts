import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { FILE_STORAGE } from '../../constants';
import {
    attachWebhookRawBody,
    dataHubJsonBodyParser,
    isFileUploadRequest,
    isWebhookRequest,
    resolveUploadJsonParserError,
    type WebhookRawBodyRequest,
} from './webhook-body.middleware';

function createUploadRequest(payload: Buffer, contentType = 'application/json') {
    const request = Readable.from([payload]) as Readable & {
        url: string;
        originalUrl: string;
        headers: Record<string, string>;
        body?: unknown;
    };
    request.url = '/data-hub/upload';
    request.originalUrl = request.url;
    request.headers = {
        'content-type': contentType,
        'content-length': String(payload.byteLength),
    };
    return request;
}

async function parseUploadRequest(request: ReturnType<typeof createUploadRequest>) {
    return new Promise<{
        status: number;
        body: unknown;
    } | undefined>((resolve, reject) => {
        let status = 200;
        const response = {
            status: vi.fn((value: number) => {
                status = value;
                return response;
            }),
            json: vi.fn((body: unknown) => {
                resolve({ status, body });
                return response;
            }),
        };
        dataHubJsonBodyParser(request as never, response as never, error => {
            if (error) reject(error);
            else resolve(undefined);
        });
    });
}

describe('webhook raw body capture', () => {
    it('keeps an independent byte-for-byte copy for HMAC verification', () => {
        const request = {} as IncomingMessage;
        const body = Buffer.from('{ "sku": "A-1" }');

        attachWebhookRawBody(request, body);
        body.fill(0);

        expect((request as WebhookRawBodyRequest).rawBody?.toString('utf8'))
            .toBe('{ "sku": "A-1" }');
    });

    it('selects raw capture only for the exact webhook route family', () => {
        expect(isWebhookRequest({ url: '/data-hub/webhook/orders' } as IncomingMessage)).toBe(true);
        expect(isWebhookRequest({
            originalUrl: '/data-hub/webhook/orders?source=pimcore',
        } as WebhookRawBodyRequest)).toBe(true);
        expect(isWebhookRequest({ url: '/admin-api' } as IncomingMessage)).toBe(false);
        expect(isWebhookRequest({ url: '/data-hub/webhooks/orders' } as IncomingMessage)).toBe(false);
    });

    it('selects the base64 parser only for the exact upload route', () => {
        expect(isFileUploadRequest({ url: '/data-hub/upload' } as IncomingMessage)).toBe(true);
        expect(isFileUploadRequest({
            originalUrl: '/data-hub/upload?persistent=true',
        } as WebhookRawBodyRequest)).toBe(true);
        expect(isFileUploadRequest({ url: '/data-hub/uploads' } as IncomingMessage)).toBe(false);
        expect(isFileUploadRequest({ url: '/admin-api' } as IncomingMessage)).toBe(false);
    });

    it('leaves non-webhook request bodies to Vendure and Nest', () => {
        const request = {
            url: '/admin-api',
            body: { query: 'large GraphQL operation' },
        };
        const next = vi.fn();

        dataHubJsonBodyParser(request as never, {} as never, next);

        expect(next).toHaveBeenCalledOnce();
        expect(request.body).toEqual({ query: 'large GraphQL operation' });
    });

    it('parses base64 upload envelopes larger than the Express default limit', async () => {
        const content = 'A'.repeat(128 * 1024);
        const payload = Buffer.from(JSON.stringify({
            filename: 'products.csv',
            content,
        }));
        const request = createUploadRequest(payload);

        await new Promise<void>((resolve, reject) => {
            dataHubJsonBodyParser(request as never, {} as never, error => {
                if (error) reject(error);
                else resolve();
            });
        });

        expect(request.body).toEqual({ filename: 'products.csv', content });
    });

    it('returns the upload response contract for malformed JSON', async () => {
        const result = await parseUploadRequest(
            createUploadRequest(Buffer.from('{"filename":')),
        );

        expect(result).toEqual({
            status: 400,
            body: {
                success: false,
                error: 'JSON upload body is malformed',
            },
        });
    });

    it('returns the upload response contract for mismatched content length', async () => {
        const request = createUploadRequest(Buffer.from('{}'));
        request.headers['content-length'] = '3';

        const result = await parseUploadRequest(request);

        expect(result).toEqual({
            status: 400,
            body: {
                success: false,
                error: 'JSON upload body is malformed',
            },
        });
    });

    it('returns the upload response contract for oversized JSON envelopes', async () => {
        const request = createUploadRequest(Buffer.from('{}'));
        request.headers['content-length'] = String(
            FILE_STORAGE.MAX_BASE64_JSON_BODY_SIZE_BYTES + 1,
        );

        const result = await parseUploadRequest(request);

        expect(result).toEqual({
            status: 413,
            body: {
                success: false,
                error: 'JSON upload body is too large',
            },
        });
    });

    it('returns the upload response contract for unsupported JSON charsets', async () => {
        const result = await parseUploadRequest(
            createUploadRequest(
                Buffer.from('{}'),
                'application/json; charset=iso-8859-1',
            ),
        );

        expect(result).toEqual({
            status: 415,
            body: {
                success: false,
                error: 'JSON upload encoding is unsupported',
            },
        });
    });

    it('does not reclassify unknown middleware failures as client input', () => {
        expect(resolveUploadJsonParserError(new Error('socket failure'))).toBeUndefined();
    });
});

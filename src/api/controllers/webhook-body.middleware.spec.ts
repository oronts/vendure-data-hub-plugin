import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import {
    attachWebhookRawBody,
    dataHubJsonBodyParser,
    isFileUploadRequest,
    isWebhookRequest,
    type WebhookRawBodyRequest,
} from './webhook-body.middleware';

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
        const request = Readable.from([payload]) as Readable & {
            url: string;
            originalUrl: string;
            headers: Record<string, string>;
            body?: unknown;
        };
        request.url = '/data-hub/upload';
        request.originalUrl = request.url;
        request.headers = {
            'content-type': 'application/json',
            'content-length': String(payload.byteLength),
        };

        await new Promise<void>((resolve, reject) => {
            dataHubJsonBodyParser(request as never, {} as never, error => {
                if (error) reject(error);
                else resolve();
            });
        });

        expect(request.body).toEqual({ filename: 'products.csv', content });
    });
});

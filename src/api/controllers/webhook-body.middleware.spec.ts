import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import {
    attachWebhookRawBody,
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
});

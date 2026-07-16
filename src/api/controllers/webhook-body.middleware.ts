import { json } from 'express';
import type { RequestHandler } from 'express';
import type { IncomingMessage } from 'node:http';
import { WEBHOOK } from '../../constants';

const WEBHOOK_ROUTE = '/data-hub/webhook';
const defaultJsonBodyParser = json();
const rawWebhookJsonBodyParser = json({
    limit: WEBHOOK.MAX_PAYLOAD_SIZE,
    verify: (request, _response, body) => attachWebhookRawBody(request, body),
});

export type WebhookRawBodyRequest = IncomingMessage & {
    originalUrl?: string;
    rawBody?: Buffer;
};

export function attachWebhookRawBody(request: IncomingMessage, body: Buffer): void {
    (request as WebhookRawBodyRequest).rawBody = Buffer.from(body);
}

export function isWebhookRequest(request: IncomingMessage): boolean {
    const path = ((request as WebhookRawBodyRequest).originalUrl ?? request.url ?? '')
        .split('?', 1)[0];
    return path === WEBHOOK_ROUTE || path.startsWith(`${WEBHOOK_ROUTE}/`);
}

export const dataHubJsonBodyParser: RequestHandler = (request, response, next) => {
    const parser = isWebhookRequest(request)
        ? rawWebhookJsonBodyParser
        : defaultJsonBodyParser;
    parser(request, response, next);
};

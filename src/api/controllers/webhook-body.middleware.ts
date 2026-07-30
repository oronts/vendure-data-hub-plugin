import { json } from 'express';
import type { RequestHandler } from 'express';
import type { IncomingMessage } from 'node:http';
import { FILE_STORAGE, WEBHOOK } from '../../constants';

const WEBHOOK_ROUTE = '/data-hub/webhook';
const FILE_UPLOAD_ROUTE = '/data-hub/upload';
const rawWebhookJsonBodyParser = json({
    limit: WEBHOOK.MAX_PAYLOAD_SIZE,
    verify: (request, _response, body) => attachWebhookRawBody(request, body),
});
const base64UploadJsonBodyParser = json({
    limit: FILE_STORAGE.MAX_BASE64_JSON_BODY_SIZE_BYTES,
});

export type WebhookRawBodyRequest = IncomingMessage & {
    originalUrl?: string;
    rawBody?: Buffer;
};

export function attachWebhookRawBody(request: IncomingMessage, body: Buffer): void {
    (request as WebhookRawBodyRequest).rawBody = Buffer.from(body);
}

export function isWebhookRequest(request: IncomingMessage): boolean {
    const path = getRequestPath(request);
    return path === WEBHOOK_ROUTE || path.startsWith(`${WEBHOOK_ROUTE}/`);
}

export function isFileUploadRequest(request: IncomingMessage): boolean {
    return getRequestPath(request) === FILE_UPLOAD_ROUTE;
}

function getRequestPath(request: IncomingMessage): string {
    return ((request as WebhookRawBodyRequest).originalUrl ?? request.url ?? '')
        .split('?', 1)[0];
}

export const dataHubJsonBodyParser: RequestHandler = (request, response, next) => {
    if (isWebhookRequest(request)) {
        rawWebhookJsonBodyParser(request, response, next);
        return;
    }
    if (isFileUploadRequest(request)) {
        base64UploadJsonBodyParser(request, response, next);
        return;
    }
    next();
};

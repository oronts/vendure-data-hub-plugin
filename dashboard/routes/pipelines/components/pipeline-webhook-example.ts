import { PLACEHOLDERS } from '../../../constants/placeholders';

export interface WebhookTriggerDetails {
    key: string;
    requiresIdempotencyKey: boolean;
    hmacHeaderName: string;
    idempotencyHeader: string;
    authType: string;
    apiKeyHeaderName: string;
    apiKeyPrefix: string;
    jwtHeaderName: string;
}

const WEBHOOK_EXAMPLE = {
    METHOD: 'POST',
    CONTENT_TYPE: 'application/json',
    BODY: '{"records":[{"id":"123","name":"Example"}]}',
} as const;

export function buildWebhookExampleCurl(
    url: string,
    webhook: WebhookTriggerDetails,
): string {
    const parts = [
        `curl -X ${WEBHOOK_EXAMPLE.METHOD} '${url}'`,
        `  -H 'Content-Type: ${WEBHOOK_EXAMPLE.CONTENT_TYPE}'`,
    ];

    if (webhook.requiresIdempotencyKey) {
        parts.push(
            `  -H '${webhook.idempotencyHeader}: ${PLACEHOLDERS.IDEMPOTENCY_KEY}'`,
        );
    }

    switch (webhook.authType) {
        case 'API_KEY':
            parts.push(
                `  -H '${webhook.apiKeyHeaderName}: ${webhook.apiKeyPrefix}${PLACEHOLDERS.API_KEY}'`,
            );
            break;
        case 'BASIC':
            parts.push(
                `  --user '${PLACEHOLDERS.BASIC_USERNAME}:${PLACEHOLDERS.BASIC_PASSWORD}'`,
            );
            break;
        case 'JWT':
            parts.push(
                `  -H '${webhook.jwtHeaderName}: Bearer ${PLACEHOLDERS.BEARER_TOKEN}'`,
            );
            break;
        case 'HMAC':
            parts.push(
                `  -H '${webhook.hmacHeaderName}: ${PLACEHOLDERS.HMAC_SIGNATURE}'`,
            );
            break;
    }

    parts.push(`  -d '${WEBHOOK_EXAMPLE.BODY}'`);
    return parts.join(' \\\n');
}

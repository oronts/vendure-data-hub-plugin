import type { RequestContext } from '@vendure/core';
import { SecretService } from '../config/secret.service';
import { buildHeaders } from './webhook.helpers';
import type { WebhookReplayEnvelope } from './webhook-replay-envelope';

export async function createWebhookAttemptHeaders(
    ctx: RequestContext,
    envelope: WebhookReplayEnvelope,
    secretService: SecretService,
): Promise<Record<string, string>> {
    const secretHeaders: Record<string, string> = {};
    for (const [name, code] of Object.entries(envelope.config.headerSecretCodes ?? {})) {
        secretHeaders[name] = await resolveRequiredSecret(ctx, code, secretService);
    }
    const signingSecret = envelope.config.secretCode
        ? await resolveRequiredSecret(ctx, envelope.config.secretCode, secretService)
        : undefined;
    return buildHeaders(
        envelope.config,
        envelope.additionalHeaders,
        secretHeaders,
        envelope.idempotencyKey,
        envelope.serializedPayload,
        signingSecret,
    );
}

async function resolveRequiredSecret(
    ctx: RequestContext,
    code: string,
    secretService: SecretService,
): Promise<string> {
    const value = await secretService.resolve(ctx, code);
    if (!value) throw new Error(`Webhook Secret Code is unavailable: ${code}`);
    return value;
}

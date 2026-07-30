/**
 * Trigger Adapter Configuration
 *
 * Schema definitions for trigger types (UI generation).
 * Types are imported from canonical trigger-types.ts.
 */

import {
    WebhookAuthType,
    WebhookTriggerConfig as BaseWebhookTriggerConfig,
    MessageTriggerConfig as BaseMessageTriggerConfig,
} from '../../shared/types';
import { WEBHOOK_AUTH_HEADERS } from '../../shared/constants';
import { INTERNAL_TIMINGS } from './defaults/core-defaults';
import { WEBHOOK } from './defaults/webhook-defaults';

export type { WebhookAuthType };

export type { BaseWebhookTriggerConfig as WebhookTriggerConfig };

/**
 * Default webhook trigger configuration
 */
export const DEFAULT_WEBHOOK_CONFIG: Partial<BaseWebhookTriggerConfig> = {
    authentication: 'HMAC',
    apiKeyHeaderName: WEBHOOK_AUTH_HEADERS.API_KEY,
    hmacHeaderName: WEBHOOK_AUTH_HEADERS.HMAC_SIGNATURE,
    hmacAlgorithm: 'SHA256',
    jwtHeaderName: WEBHOOK_AUTH_HEADERS.JWT,
    requireIdempotencyKey: true,
    idempotencyKeyHeader: WEBHOOK_AUTH_HEADERS.IDEMPOTENCY_KEY,
    idempotencyTtlSec: WEBHOOK.DEFAULT_IDEMPOTENCY_TTL_SEC,
    rateLimit: INTERNAL_TIMINGS.DEFAULT_WEBHOOK_RATE_LIMIT,
    rateLimitWindow: INTERNAL_TIMINGS.DEFAULT_RATE_LIMIT_WINDOW_MS / 1_000,
};

// MESSAGE TRIGGER CONFIGURATION

export type { BaseMessageTriggerConfig as MessageTriggerConfig };

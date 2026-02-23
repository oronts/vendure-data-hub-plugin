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

export type { WebhookAuthType };

export type { BaseWebhookTriggerConfig as WebhookTriggerConfig };

/**
 * Default webhook trigger configuration
 */
export const DEFAULT_WEBHOOK_CONFIG: Partial<BaseWebhookTriggerConfig> = {
    authentication: 'NONE',
    apiKeyHeaderName: 'x-api-key',
    hmacHeaderName: 'x-datahub-signature',
    hmacAlgorithm: 'SHA256',
    jwtHeaderName: 'authorization',
    requireIdempotencyKey: false,
    rateLimit: 100,
};

// MESSAGE TRIGGER CONFIGURATION

export type { BaseMessageTriggerConfig as MessageTriggerConfig };

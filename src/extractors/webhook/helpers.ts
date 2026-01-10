/**
 * Webhook Extractor - Helpers
 *
 * Helper functions for webhook processing.
 */

import * as crypto from 'crypto';
import { JsonObject } from '../../types/index';
import { ExtractorContext } from '../../types/index';
import { WebhookExtractorConfig } from './types';

/**
 * Get value from object by dot-notation path
 */
export function getValueByPath(obj: JsonObject, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current && typeof current === 'object') {
            current = (current as Record<string, unknown>)[part];
        } else {
            return undefined;
        }
    }

    return current;
}

/**
 * Validate webhook signature
 */
export async function validateSignature(
    context: ExtractorContext,
    config: WebhookExtractorConfig,
    webhookData: JsonObject,
): Promise<boolean> {
    if (!config.signatureSecretCode) {
        return false;
    }

    try {
        const secret = await context.secrets.get(config.signatureSecretCode);
        if (!secret) {
            context.logger.error('Signature secret not found');
            return false;
        }

        // Get signature from checkpoint (should be stored by webhook controller)
        const signature = webhookData['__signature'] as string | undefined;
        const rawBody = webhookData['__rawBody'] as string | undefined;

        if (!signature || !rawBody) {
            context.logger.error('Signature or raw body not found in webhook data');
            return false;
        }

        // Compute expected signature
        const algorithm = config.signatureAlgorithm || 'sha256';
        const computedSignature = crypto
            .createHmac(algorithm, secret)
            .update(rawBody)
            .digest('hex');

        const expectedSignature = `${algorithm}=${computedSignature}`;

        // Compare signatures (timing-safe)
        const isValid = crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature),
        );

        if (!isValid) {
            context.logger.warn('Webhook signature validation failed');
        }

        return isValid;
    } catch (error) {
        context.logger.error('Signature validation error', error as Error);
        return false;
    }
}

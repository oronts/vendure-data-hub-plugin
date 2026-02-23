/**
 * Webhook Extractor - Helpers
 *
 * Helper functions for webhook processing.
 */

import * as crypto from 'crypto';
import { JsonObject } from '../../types/index';
import { ExtractorContext } from '../../types/index';
import { WebhookExtractorConfig } from './types';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';

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
        // timingSafeEqual requires buffers of equal length, so we must check first
        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (signatureBuffer.length !== expectedBuffer.length) {
            context.logger.warn('Webhook signature validation failed: length mismatch');
            return false;
        }

        const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

        if (!isValid) {
            context.logger.warn('Webhook signature validation failed');
        }

        return isValid;
    } catch (error) {
        context.logger.error('Signature validation error', toErrorOrUndefined(error), { error: getErrorMessage(error) });
        return false;
    }
}

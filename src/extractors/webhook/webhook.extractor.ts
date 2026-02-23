import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../types/index';
import {
    BatchDataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    ExtractorResult,
    RecordEnvelope,
    ExtractorCategory,
} from '../../types/index';
import { WebhookExtractorConfig } from './types';
import { getNestedValue } from '../../operators/helpers';
import { validateSignature } from './helpers';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { WEBHOOK_EXTRACTOR_SCHEMA } from './schema';

@Injectable()
export class WebhookExtractor implements BatchDataExtractor<WebhookExtractorConfig> {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'webhook';
    readonly name = 'Webhook Extractor';
    readonly category: ExtractorCategory = 'WEBHOOK';
    readonly supportsPagination = false;
    readonly supportsIncremental = false;
    readonly supportsCancellation = false;

    readonly schema = WEBHOOK_EXTRACTOR_SCHEMA;

    async extractAll(
        context: ExtractorContext,
        config: WebhookExtractorConfig,
    ): Promise<ExtractorResult> {
        const startTime = Date.now();

        try {
            context.logger.info('Processing webhook payload');

            // Get webhook data from checkpoint
            const webhookData = context.checkpoint.data as JsonObject | undefined;

            if (!webhookData) {
                context.logger.warn('No webhook data found in checkpoint');
                return {
                    records: [],
                    metrics: {
                        totalFetched: 0,
                        durationMs: Date.now() - startTime,
                    },
                };
            }

            if (config.validateSignature) {
                const isValid = await validateSignature(context, config, webhookData);
                if (!isValid) {
                    throw new Error('Invalid webhook signature');
                }
            }

            let rawRecords: unknown[];

            if (config.dataPath) {
                const extracted = getNestedValue(webhookData, config.dataPath);
                if (Array.isArray(extracted)) {
                    rawRecords = extracted;
                } else if (extracted && config.wrapSingleRecord !== false) {
                    rawRecords = [extracted];
                } else {
                    rawRecords = [];
                }
            } else {
                if (Array.isArray(webhookData)) {
                    rawRecords = webhookData;
                } else if (config.wrapSingleRecord !== false) {
                    rawRecords = [webhookData];
                } else {
                    rawRecords = [];
                }
            }

            const records: RecordEnvelope[] = rawRecords.map((record, index) => {
                const data = record as JsonObject;
                const idempotencyKey = config.idempotencyKeyField
                    ? getNestedValue(data, config.idempotencyKeyField)
                    : undefined;

                return {
                    data,
                    meta: {
                        sourceId: `webhook:${context.pipelineId}`,
                        sourceTimestamp: new Date().toISOString(),
                        sequence: index,
                        idempotencyKey: idempotencyKey as string | undefined,
                    },
                };
            });

            const durationMs = Date.now() - startTime;

            context.logger.info('Webhook payload processed', {
                recordCount: records.length,
                durationMs,
            });

            return {
                records,
                metrics: {
                    totalFetched: records.length,
                    durationMs,
                },
                metadata: {
                    sourceType: 'webhook',
                    extractedAt: new Date().toISOString(),
                    idempotencyKeyField: config.idempotencyKeyField,
                },
            };
        } catch (error) {
            context.logger.error('Webhook processing failed', toErrorOrUndefined(error), { error: getErrorMessage(error) });
            throw error;
        }
    }

    async validate(
        _context: ExtractorContext,
        config: WebhookExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        const errors: Array<{ field: string; message: string }> = [];

        if (config.validateSignature) {
            if (!config.signatureSecretCode) {
                errors.push({ field: 'signatureSecretCode', message: 'Signature secret is required when validation is enabled' });
            }
        }

        return { valid: errors.length === 0, errors };
    }
}

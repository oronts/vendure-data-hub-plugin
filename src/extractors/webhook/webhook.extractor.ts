import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../types/index';
import {
    BatchDataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    ExtractorResult,
    RecordEnvelope,
    StepConfigSchema,
    ExtractorCategory,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { WebhookExtractorConfig } from './types';
import { getValueByPath, validateSignature } from './helpers';

@Injectable()
export class WebhookExtractor implements BatchDataExtractor<WebhookExtractorConfig> {
    readonly type = 'extractor' as const;
    readonly code = 'webhook';
    readonly name = 'Webhook Extractor';
    readonly description = 'Process incoming webhook payloads';
    readonly category: ExtractorCategory = 'WEBHOOK';
    readonly version = '1.0.0';
    readonly icon = 'webhook';
    readonly supportsPagination = false;
    readonly supportsIncremental = false;
    readonly supportsCancellation = false;

    private readonly _logger: DataHubLogger;

    constructor(loggerFactory: DataHubLoggerFactory) {
        this._logger = loggerFactory.createLogger(LOGGER_CONTEXTS.WEBHOOK_EXTRACTOR);
    }

    readonly schema: StepConfigSchema = {
        fields: [
            {
                key: 'dataPath',
                label: 'Data Path',
                description: 'JSON path to records array in webhook payload',
                type: 'string',
                placeholder: 'data.records',
            },
            {
                key: 'idempotencyKeyField',
                label: 'Idempotency Key Field',
                description: 'Field to use for deduplication',
                type: 'string',
                placeholder: 'id',
            },
            {
                key: 'validateSignature',
                label: 'Validate Signature',
                description: 'Validate webhook signature',
                type: 'boolean',
                defaultValue: false,
            },
            {
                key: 'signatureSecretCode',
                label: 'Signature Secret',
                description: 'Secret code for signature validation',
                type: 'secret',
                dependsOn: { field: 'validateSignature', value: true },
            },
            {
                key: 'signatureHeader',
                label: 'Signature Header',
                description: 'Header containing signature',
                type: 'string',
                defaultValue: 'X-Hub-Signature-256',
                dependsOn: { field: 'validateSignature', value: true },
            },
            {
                key: 'signatureAlgorithm',
                label: 'Signature Algorithm',
                type: 'select',
                options: [
                    { value: 'sha256', label: 'SHA-256' },
                    { value: 'sha1', label: 'SHA-1' },
                    { value: 'md5', label: 'MD5' },
                ],
                defaultValue: 'sha256',
                dependsOn: { field: 'validateSignature', value: true },
            },
            {
                key: 'wrapSingleRecord',
                label: 'Wrap Single Record',
                description: 'Wrap single object in array',
                type: 'boolean',
                defaultValue: true,
            },
        ],
    };

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
                const extracted = getValueByPath(webhookData, config.dataPath);
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
                    ? getValueByPath(data, config.idempotencyKeyField)
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
            context.logger.error('Webhook processing failed', error as Error);
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

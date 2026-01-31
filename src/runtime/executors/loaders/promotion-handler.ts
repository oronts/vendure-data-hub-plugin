/**
 * Promotion upsert loader handler
 */
import { Injectable, Logger } from '@nestjs/common';
import {
    RequestContext,
    PromotionService,
    RequestContextService,
    Promotion,
    ID,
} from '@vendure/core';
import {
    ConfigurableOperationInput,
    CreatePromotionInput,
    UpdatePromotionInput,
    AssignPromotionsToChannelInput,
} from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { safeJson } from '../../utils';
import { LoaderHandler } from './types';
import { getErrorMessage } from '../../../services/logger/error-utils';

/**
 * Configuration interface for the promotion handler step
 */
interface PromotionHandlerConfig {
    /** Field name in record containing the coupon code (default: 'code') */
    codeField?: string;
    /** Field name in record containing the enabled flag (default: 'enabled') */
    enabledField?: string;
    /** Field name in record containing the promotion name (default: 'name') */
    nameField?: string;
    /** Field name in record containing the start date (default: 'startsAt') */
    startsAtField?: string;
    /** Field name in record containing the end date (default: 'endsAt') */
    endsAtField?: string;
    /** Field name in record containing conditions JSON */
    conditionsField?: string;
    /** Field name in record containing actions JSON */
    actionsField?: string;
    /** Optional channel token for multi-channel assignment */
    channel?: string;
}

/**
 * Result type from promotion create/update operations
 */
interface PromotionResult {
    id: ID;
}

/**
 * Type guard to check if a value is a valid PromotionHandlerConfig
 */
function isPromotionHandlerConfig(value: unknown): value is PromotionHandlerConfig {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const config = value as Record<string, unknown>;
    return (
        (config.codeField === undefined || typeof config.codeField === 'string') &&
        (config.enabledField === undefined || typeof config.enabledField === 'string') &&
        (config.nameField === undefined || typeof config.nameField === 'string') &&
        (config.startsAtField === undefined || typeof config.startsAtField === 'string') &&
        (config.endsAtField === undefined || typeof config.endsAtField === 'string') &&
        (config.conditionsField === undefined || typeof config.conditionsField === 'string') &&
        (config.actionsField === undefined || typeof config.actionsField === 'string') &&
        (config.channel === undefined || typeof config.channel === 'string')
    );
}

/**
 * Safely get a typed config from step.config
 */
function getTypedConfig(config: JsonObject): PromotionHandlerConfig {
    if (isPromotionHandlerConfig(config)) {
        return config;
    }
    // Return empty config with defaults if validation fails
    return {};
}

/**
 * Get a field value from record using configurable field name
 */
function getRecordField(rec: RecordObject, fieldName: string): unknown {
    return rec[fieldName];
}

/**
 * Type guard to check if a value has an id property
 */
function hasId(value: unknown): value is PromotionResult {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        (typeof (value as PromotionResult).id === 'string' ||
            typeof (value as PromotionResult).id === 'number')
    );
}

/**
 * Type guard for checking if value is a Promotion entity
 */
function isPromotion(value: unknown): value is Promotion {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        'couponCode' in value
    );
}

/**
 * Safely parse conditions/actions JSON into ConfigurableOperationInput array
 */
function parseConfigurableOperations(
    jsonValue: unknown,
): ConfigurableOperationInput[] {
    if (!Array.isArray(jsonValue)) {
        return [];
    }
    // Filter and validate each operation
    return jsonValue.filter(
        (item): item is ConfigurableOperationInput =>
            typeof item === 'object' &&
            item !== null &&
            typeof item.code === 'string' &&
            Array.isArray(item.arguments),
    );
}

/**
 * Convert a raw value to boolean
 */
function toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    return String(value).toLowerCase() === 'true';
}

/**
 * Convert a raw value to Date or undefined
 */
function toDateOrUndefined(value: unknown): Date | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (value instanceof Date) {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? undefined : date;
    }
    return undefined;
}

@Injectable()
export class PromotionHandler implements LoaderHandler {
    private readonly logger = new Logger(PromotionHandler.name);

    constructor(
        private promotionService: PromotionService,
        private requestContextService: RequestContextService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0,
            fail = 0;
        const config = getTypedConfig(step.config);

        for (const rec of input) {
            try {
                const codeFieldName = config.codeField ?? 'code';
                const codeValue = getRecordField(rec, codeFieldName);
                const code = codeValue ? String(codeValue) : '';

                if (!code) {
                    fail++;
                    continue;
                }

                const enabledFieldName = config.enabledField ?? 'enabled';
                const enabledVal = getRecordField(rec, enabledFieldName);
                const enabled = toBoolean(enabledVal);

                const nameFieldName = config.nameField ?? 'name';
                const nameValue = getRecordField(rec, nameFieldName);
                const name = nameValue ? String(nameValue) : code;

                const startsAtFieldName = config.startsAtField ?? 'startsAt';
                const startsAtRaw = getRecordField(rec, startsAtFieldName);
                const startsAt = toDateOrUndefined(startsAtRaw);

                const endsAtFieldName = config.endsAtField ?? 'endsAt';
                const endsAtRaw = getRecordField(rec, endsAtFieldName);
                const endsAt = toDateOrUndefined(endsAtRaw);

                const conditionsJsonField = config.conditionsField;
                const actionsJsonField = config.actionsField;

                const conditionsRaw = conditionsJsonField
                    ? safeJson(getRecordField(rec, conditionsJsonField))
                    : null;
                const actionsRaw = actionsJsonField
                    ? safeJson(getRecordField(rec, actionsJsonField))
                    : null;

                const conditions = parseConfigurableOperations(conditionsRaw ?? []);
                const actions = parseConfigurableOperations(actionsRaw ?? []);

                // Find existing promotion by coupon code
                const list = await this.promotionService.findAll(ctx, {
                    filter: { couponCode: { eq: code } },
                    take: 1,
                });
                const existing = list.items[0];
                const channel = config.channel;
                let opCtx = ctx;

                if (channel) {
                    const newCtx = await this.requestContextService.create({
                        apiType: ctx.apiType,
                        channelOrToken: channel,
                    });
                    if (newCtx) {
                        opCtx = newCtx;
                    }
                }

                if (existing && isPromotion(existing)) {
                    const updateInput: UpdatePromotionInput = {
                        id: existing.id,
                        enabled,
                        startsAt,
                        endsAt,
                        couponCode: code,
                        conditions,
                        actions,
                        translations: [
                            {
                                languageCode: opCtx.languageCode,
                                name,
                                description: '',
                            },
                        ],
                    };
                    const updated = await this.promotionService.updatePromotion(
                        opCtx,
                        updateInput,
                    );

                    if (channel && hasId(updated)) {
                        try {
                            const assignInput: AssignPromotionsToChannelInput = {
                                promotionIds: [updated.id],
                                channelId: opCtx.channelId,
                            };
                            await this.promotionService.assignPromotionsToChannel(
                                opCtx,
                                assignInput,
                            );
                        } catch (error) {
                            this.logger.warn(
                                `Failed to assign promotion ${updated.id} to channel: ${error instanceof Error ? error.message : String(error)}`,
                            );
                        }
                    }
                } else {
                    const createInput: CreatePromotionInput = {
                        enabled,
                        startsAt,
                        endsAt,
                        couponCode: code,
                        conditions,
                        actions,
                        translations: [
                            {
                                languageCode: opCtx.languageCode,
                                name,
                                description: '',
                            },
                        ],
                    };
                    const created = await this.promotionService.createPromotion(
                        opCtx,
                        createInput,
                    );

                    if (channel && hasId(created)) {
                        try {
                            const assignInput: AssignPromotionsToChannelInput = {
                                promotionIds: [created.id],
                                channelId: opCtx.channelId,
                            };
                            await this.promotionService.assignPromotionsToChannel(
                                opCtx,
                                assignInput,
                            );
                        } catch (error) {
                            this.logger.warn(
                                `Failed to assign promotion ${created.id} to channel: ${error instanceof Error ? error.message : String(error)}`,
                            );
                        }
                    }
                }
                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(
                        step.key,
                        getErrorMessage(e) || 'promotionUpsert failed',
                        rec,
                    );
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, unknown>> {
        let exists = 0,
            missing = 0;
        const config = getTypedConfig(step.config);

        for (const rec of input) {
            const codeFieldName = config.codeField ?? 'code';
            const codeValue = getRecordField(rec, codeFieldName);
            const code = codeValue ? String(codeValue) : '';

            if (!code) {
                continue;
            }

            const list = await this.promotionService.findAll(ctx, {
                filter: { couponCode: { eq: code } },
                take: 1,
            });

            if (list.items[0]) {
                exists++;
            } else {
                missing++;
            }
        }
        return { exists, missing };
    }
}

/**
 * Promotion upsert loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    PromotionService,
    RequestContextService,
    ChannelService,
    Promotion,
    ID,
} from '@vendure/core';
import {
    ConfigurableOperationInput,
    CreatePromotionInput,
    UpdatePromotionInput,
    AssignPromotionsToChannelInput,
    LanguageCode,
    PromotionTranslationInput,
} from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { safeJson } from '../../utils';
import { LoaderHandler } from './types';
import { LoadStrategy } from '../../../constants/enums';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getObjectValue } from '../../../loaders/shared-helpers';
import { parseTranslationsInput, resolveChannelIds } from './shared-lookups';
import { LOGGER_CONTEXTS } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';

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
    /** Field name for custom fields object */
    customFieldsField?: string;
    /** Load strategy: UPSERT (default), CREATE, or UPDATE */
    strategy?: LoadStrategy;
    /** Record field containing multi-language translations (array or object map) */
    translationsField?: string;
    /** Record field containing channel codes for dynamic per-record channel assignment */
    channelsField?: string;
    /** Field name in record containing the description (default: not set → '') */
    descriptionField?: string;
    /** Field name in record containing the per-customer usage limit */
    perCustomerUsageLimitField?: string;
}

/**
 * Result type from promotion create/update operations
 */
interface PromotionResult {
    id: ID;
}

/**
 * Safely cast step config to PromotionHandlerConfig
 */
function getConfig(config: JsonObject): PromotionHandlerConfig {
    return config as unknown as PromotionHandlerConfig;
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
    private readonly logger: DataHubLogger;

    constructor(
        private promotionService: PromotionService,
        private requestContextService: RequestContextService,
        private channelService: ChannelService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PROMOTION_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0,
            fail = 0;
        const config = getConfig(step.config);

        const channelCache = new Map<string, ID>();

        const codeFieldName = config.codeField ?? 'code';
        const enabledFieldName = config.enabledField ?? 'enabled';
        const nameFieldName = config.nameField ?? 'name';
        const descFieldName = config.descriptionField ?? 'description';
        const startsAtFieldName = config.startsAtField ?? 'startsAt';
        const endsAtFieldName = config.endsAtField ?? 'endsAt';
        const conditionsJsonField = config.conditionsField;
        const actionsJsonField = config.actionsField;
        const customFieldsKey = config.customFieldsField ?? 'customFields';

        for (const rec of input) {
            try {
                const codeValue = getRecordField(rec, codeFieldName);
                const code = codeValue ? String(codeValue) : '';

                if (!code) {
                    if (onRecordError) {
                        await onRecordError(step.key, 'Missing required field: code', rec);
                    }
                    fail++;
                    continue;
                }

                const enabledVal = getRecordField(rec, enabledFieldName);
                const enabled = enabledVal != null ? toBoolean(enabledVal) : true;

                const nameValue = getRecordField(rec, nameFieldName);
                let name = nameValue ? String(nameValue) : code;

                // Multi-language: extract name from first translation if missing
                if (name === code && config.translationsField) {
                    const raw = rec[config.translationsField];
                    if (raw) {
                        const parsed = parseTranslationsInput(raw);
                        if (parsed.length > 0 && parsed[0].name) {
                            name = String(parsed[0].name);
                        }
                    }
                }

                const descriptionRaw = getRecordField(rec, descFieldName);
                const description = descriptionRaw != null ? String(descriptionRaw) : '';

                const startsAtRaw = getRecordField(rec, startsAtFieldName);
                const startsAt = toDateOrUndefined(startsAtRaw);

                const endsAtRaw = getRecordField(rec, endsAtFieldName);
                const endsAt = toDateOrUndefined(endsAtRaw);

                const conditionsRaw = conditionsJsonField
                    ? safeJson(getRecordField(rec, conditionsJsonField))
                    : null;
                const actionsRaw = actionsJsonField
                    ? safeJson(getRecordField(rec, actionsJsonField))
                    : null;

                const conditions = parseConfigurableOperations(conditionsRaw ?? []);
                const actions = parseConfigurableOperations(actionsRaw ?? []);

                const customFields = getObjectValue(rec, customFieldsKey);

                // Per-customer usage limit
                let perCustomerUsageLimit: number | undefined;
                if (config.perCustomerUsageLimitField) {
                    const limitRaw = getRecordField(rec, config.perCustomerUsageLimitField);
                    if (limitRaw != null) {
                        const limitVal = Number(limitRaw);
                        if (!isNaN(limitVal)) {
                            perCustomerUsageLimit = Math.floor(limitVal);
                        }
                    }
                }

                // Build translations
                const translations = this.buildTranslations(ctx, rec, config, name, description);

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

                const strategy = config.strategy ?? LoadStrategy.UPSERT;
                let promotionId: ID | undefined;

                if (existing && isPromotion(existing)) {
                    if (strategy === LoadStrategy.CREATE) {
                        ok++;
                        continue;
                    }
                    const updateInput: UpdatePromotionInput = {
                        id: existing.id,
                        enabled,
                        startsAt,
                        endsAt,
                        couponCode: code,
                        conditions,
                        actions,
                        translations,
                        ...(customFields ? { customFields } : {}),
                        ...(perCustomerUsageLimit !== undefined ? { perCustomerUsageLimit } : {}),
                    };
                    const updated = await this.promotionService.updatePromotion(
                        opCtx,
                        updateInput,
                    );

                    if (hasId(updated)) {
                        promotionId = updated.id;
                        if (channel) {
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
                                    `Failed to assign promotion ${updated.id} to channel: ${getErrorMessage(error)}`,
                                );
                            }
                        }
                    }
                } else {
                    if (strategy === LoadStrategy.UPDATE) {
                        fail++;
                        if (onRecordError) {
                            await onRecordError(step.key, `Promotion not found for update: ${code}`, rec);
                        }
                        continue;
                    }
                    const createInput: CreatePromotionInput = {
                        enabled,
                        startsAt,
                        endsAt,
                        couponCode: code,
                        conditions,
                        actions,
                        translations,
                        ...(customFields ? { customFields } : {}),
                        ...(perCustomerUsageLimit !== undefined ? { perCustomerUsageLimit } : {}),
                    };
                    const created = await this.promotionService.createPromotion(
                        opCtx,
                        createInput,
                    );

                    if (hasId(created)) {
                        promotionId = created.id;
                        if (channel) {
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
                                    `Failed to assign promotion ${created.id} to channel: ${getErrorMessage(error)}`,
                                );
                            }
                        }
                    }
                }

                // Assign to per-record channels
                if (promotionId && config.channelsField) {
                    const rawValue = rec[config.channelsField];
                    if (rawValue != null) {
                        const channelIds = await resolveChannelIds(this.channelService, opCtx, rawValue, channelCache, this.logger);
                        if (channelIds.length > 0) {
                            try {
                                await this.channelService.assignToChannels(opCtx, Promotion, promotionId, channelIds);
                            } catch { /* channel assignment is best-effort */ }
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
                        getErrorStack(e),
                    );
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    /**
     * Build promotion translations. Multi-language from translationsField, or single-language fallback.
     * Promotion translations have {languageCode, name, description}.
     */
    private buildTranslations(
        ctx: RequestContext,
        rec: RecordObject,
        cfg: PromotionHandlerConfig,
        name: string,
        description: string,
    ): PromotionTranslationInput[] {
        if (cfg.translationsField) {
            const raw = rec[cfg.translationsField];
            if (raw) {
                const parsed = parseTranslationsInput(raw);
                if (parsed.length > 0) {
                    return parsed.map(t => ({
                        languageCode: String(t.languageCode) as LanguageCode,
                        name: String(t.name ?? name),
                        description: t.description != null ? String(t.description) : '',
                    }));
                }
            }
        }
        return [{
            languageCode: ctx.languageCode as LanguageCode,
            name,
            description,
        }];
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, unknown>> {
        let exists = 0,
            missing = 0;
        const config = getConfig(step.config);

        const codeFieldName = config.codeField ?? 'code';
        for (const rec of input) {
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

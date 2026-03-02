/**
 * Payment Method upsert loader handler
 *
 * Reads configurable field names from step.config and upserts PaymentMethod
 * entities via PaymentMethodService. Supports handler and checker configuration.
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    PaymentMethodService,
    ChannelService,
    RequestContextService,
    PaymentMethod,
    ID,
} from '@vendure/core';
import { LanguageCode } from '@vendure/common/lib/generated-types';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { LoadStrategy } from '../../../constants/enums';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getStringValue, getObjectValue } from '../../../loaders/shared-helpers';
import { parseTranslationsInput, resolveChannelIds, toConfigurableOperation } from './shared-lookups';
import { LOGGER_CONTEXTS } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';

/**
 * Configuration for the payment method handler step (mirrors loader-adapters.ts schema)
 */
interface PaymentMethodHandlerConfig {
    nameField?: string;
    codeField?: string;
    descriptionField?: string;
    enabledField?: string;
    handlerField?: string;
    checkerField?: string;
    strategy?: LoadStrategy;
    /** Record field containing multi-language translations (array or object map) */
    translationsField?: string;
    /** Record field containing channel codes for dynamic per-record channel assignment */
    channelsField?: string;
    /** Record field containing custom fields object */
    customFieldsField?: string;
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): PaymentMethodHandlerConfig {
    return config as unknown as PaymentMethodHandlerConfig;
}

@Injectable()
export class PaymentMethodHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private paymentMethodService: PaymentMethodService,
        private channelService: ChannelService,
        private requestContextService: RequestContextService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PAYMENT_METHOD_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0;
        let fail = 0;
        const cfg = getConfig(step.config);
        const channelCache = new Map<string, ID>();

        for (const rec of input) {
            try {
                const nameField = cfg.nameField ?? 'name';
                const codeField = cfg.codeField ?? 'code';
                const descriptionField = cfg.descriptionField ?? 'description';
                const enabledField = cfg.enabledField ?? 'enabled';
                const handlerField = cfg.handlerField ?? 'handler';
                const checkerField = cfg.checkerField ?? 'checker';

                let name = getStringValue(rec, nameField);
                const code = getStringValue(rec, codeField);

                // Multi-language: extract name from first translation if missing
                if (!name && cfg.translationsField) {
                    const raw = rec[cfg.translationsField];
                    if (raw) {
                        const parsed = parseTranslationsInput(raw);
                        if (parsed.length > 0 && parsed[0].name) {
                            name = String(parsed[0].name);
                        }
                    }
                }

                if (!name || !code) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, 'Missing required field: name or code', rec);
                    }
                    continue;
                }

                const handlerOp = toConfigurableOperation(rec[handlerField]);
                if (!handlerOp) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, `Missing or invalid handler for payment method "${code}"`, rec);
                    }
                    continue;
                }

                const description = getStringValue(rec, descriptionField) ?? '';
                const enabledRaw = rec[enabledField];
                const enabled = enabledRaw === undefined ? true : Boolean(enabledRaw);
                const checkerOp = toConfigurableOperation(rec[checkerField]);
                const customFieldsKey = cfg.customFieldsField ?? 'customFields';
                const customFields = getObjectValue(rec, customFieldsKey);

                // Build translations
                const translations = this.buildTranslations(ctx, rec, cfg, name, description);

                // Find existing by code
                const existing = await this.findExistingByCode(ctx, code);
                const strategy = cfg.strategy ?? LoadStrategy.UPSERT;
                let pmId: ID | undefined;

                if (existing) {
                    if (strategy === LoadStrategy.CREATE) {
                        ok++;
                        continue;
                    }
                    const updateInput: Record<string, unknown> = {
                        id: existing.id,
                        code,
                        enabled,
                        handler: handlerOp,
                        translations,
                    };
                    if (checkerOp) {
                        updateInput.checker = checkerOp;
                    }
                    if (customFields) {
                        updateInput.customFields = customFields;
                    }
                    await this.paymentMethodService.update(
                        ctx,
                        updateInput as Parameters<typeof this.paymentMethodService.update>[1],
                    );
                    pmId = existing.id;
                } else {
                    if (strategy === LoadStrategy.UPDATE) {
                        fail++;
                        if (onRecordError) {
                            await onRecordError(step.key, `Payment method not found for update: ${code}`, rec);
                        }
                        continue;
                    }
                    const createInput: Record<string, unknown> = {
                        code,
                        enabled,
                        handler: handlerOp,
                        translations,
                    };
                    if (checkerOp) {
                        createInput.checker = checkerOp;
                    }
                    if (customFields) {
                        createInput.customFields = customFields;
                    }
                    const created = await this.paymentMethodService.create(
                        ctx,
                        createInput as Parameters<typeof this.paymentMethodService.create>[1],
                    );
                    pmId = (created as unknown as { id: ID }).id;
                }

                // Assign to per-record channels
                if (pmId && cfg.channelsField) {
                    const rawValue = rec[cfg.channelsField];
                    if (rawValue != null) {
                        const channelIds = await resolveChannelIds(this.channelService, ctx, rawValue, channelCache, this.logger);
                        if (channelIds.length > 0) {
                            try {
                                await this.channelService.assignToChannels(ctx, PaymentMethod, pmId, channelIds);
                            } catch { /* channel assignment is best-effort */ }
                        }
                    }
                }

                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'paymentMethodUpsert failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    /**
     * Build payment method translations. Multi-language from translationsField, or single-language fallback.
     * PaymentMethod translations have {languageCode, name, description}.
     */
    private buildTranslations(
        ctx: RequestContext,
        rec: RecordObject,
        cfg: PaymentMethodHandlerConfig,
        name: string,
        description: string,
    ): Array<{ languageCode: LanguageCode; name: string; description: string }> {
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

    private async findExistingByCode(ctx: RequestContext, code: string): Promise<{ id: ID } | null> {
        const methods = await this.paymentMethodService.findAll(ctx, {
            filter: { code: { eq: code } },
        });
        return methods.totalItems > 0 ? { id: methods.items[0].id } : null;
    }
}

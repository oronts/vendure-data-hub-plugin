/**
 * Channel upsert loader handler
 *
 * Reads configurable field names from step.config and upserts Channel entities
 * via ChannelService. Supports currencies, languages, and zone configuration.
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    ChannelService,
    ZoneService,
    CurrencyCode,
    LanguageCode,
    ID,
} from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { LoadStrategy } from '../../../constants/enums';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getStringValue, getArrayValue, getObjectValue } from '../../../loaders/shared-helpers';
import { generateChannelToken, parseCurrencyCode, parseLanguageCode } from '../../../loaders/channel/helpers';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { LOGGER_CONTEXTS } from '../../../constants/index';

/**
 * Configuration for the channel handler step (mirrors loader-handler-registry.ts schema)
 */
interface ChannelHandlerConfig {
    codeField?: string;
    tokenField?: string;
    defaultLanguageCodeField?: string;
    availableLanguageCodesField?: string;
    defaultCurrencyCodeField?: string;
    availableCurrencyCodesField?: string;
    pricesIncludeTaxField?: string;
    defaultTaxZoneCodeField?: string;
    defaultShippingZoneCodeField?: string;
    sellerIdField?: string;
    customFieldsField?: string;
    strategy?: LoadStrategy;
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): ChannelHandlerConfig {
    return config as unknown as ChannelHandlerConfig;
}

@Injectable()
export class ChannelHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;
    private zoneCache = new Map<string, ID>();

    constructor(
        private channelService: ChannelService,
        private zoneService: ZoneService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CHANNEL_LOADER);
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
        this.zoneCache = new Map<string, ID>();

        // Pre-fetch all channels and zones to avoid N+1 queries
        const allChannelsResult = await this.channelService.findAll(ctx);
        const allChannels = ((allChannelsResult as { items?: Array<{ id: ID; code: string }> }).items ?? allChannelsResult) as Array<{ id: ID; code: string }>;
        const channelByCode = new Map(allChannels.map(c => [c.code, c]));

        const allZones = await this.zoneService.findAll(ctx);
        for (const z of allZones.items) {
            this.zoneCache.set(z.name.toLowerCase(), z.id);
        }

        for (const rec of input) {
            try {
                const codeField = cfg.codeField ?? 'code';
                const tokenField = cfg.tokenField ?? 'token';
                const defaultLanguageCodeField = cfg.defaultLanguageCodeField ?? 'defaultLanguageCode';
                const availableLanguageCodesField = cfg.availableLanguageCodesField ?? 'availableLanguageCodes';
                const defaultCurrencyCodeField = cfg.defaultCurrencyCodeField ?? 'defaultCurrencyCode';
                const availableCurrencyCodesField = cfg.availableCurrencyCodesField ?? 'availableCurrencyCodes';
                const pricesIncludeTaxField = cfg.pricesIncludeTaxField ?? 'pricesIncludeTax';
                const defaultTaxZoneCodeField = cfg.defaultTaxZoneCodeField ?? 'defaultTaxZoneCode';
                const defaultShippingZoneCodeField = cfg.defaultShippingZoneCodeField ?? 'defaultShippingZoneCode';
                const sellerIdField = cfg.sellerIdField ?? 'sellerId';

                const code = getStringValue(rec, codeField);
                const defaultLangStr = getStringValue(rec, defaultLanguageCodeField);
                const defaultCurrStr = getStringValue(rec, defaultCurrencyCodeField);

                if (!code) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, 'Missing required field: code', rec);
                    }
                    continue;
                }
                if (!defaultLangStr) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, 'Missing required field: defaultLanguageCode', rec);
                    }
                    continue;
                }
                if (!defaultCurrStr) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, 'Missing required field: defaultCurrencyCode', rec);
                    }
                    continue;
                }

                const defaultLanguageCode = parseLanguageCode(defaultLangStr);
                const defaultCurrencyCode = parseCurrencyCode(defaultCurrStr);

                if (!defaultLanguageCode) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, `Invalid language code: ${defaultLangStr}`, rec);
                    }
                    continue;
                }
                if (!defaultCurrencyCode) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, `Invalid currency code: ${defaultCurrStr}`, rec);
                    }
                    continue;
                }

                const token = getStringValue(rec, tokenField) || generateChannelToken(code);

                // Parse available languages/currencies
                const availableLangRaw = getArrayValue<string>(rec, availableLanguageCodesField) ?? [];
                const availableCurrRaw = getArrayValue<string>(rec, availableCurrencyCodesField) ?? [];

                const availableLanguageCodes = availableLangRaw
                    .map(parseLanguageCode)
                    .filter((c): c is LanguageCode => c !== null);
                const availableCurrencyCodes = availableCurrRaw
                    .map(parseCurrencyCode)
                    .filter((c): c is CurrencyCode => c !== null);

                if (!availableLanguageCodes.includes(defaultLanguageCode)) {
                    availableLanguageCodes.unshift(defaultLanguageCode);
                }
                if (!availableCurrencyCodes.includes(defaultCurrencyCode)) {
                    availableCurrencyCodes.unshift(defaultCurrencyCode);
                }

                const pricesIncludeTaxRaw = rec[pricesIncludeTaxField];
                const pricesIncludeTax = pricesIncludeTaxRaw === undefined ? false : Boolean(pricesIncludeTaxRaw);

                // Resolve zone IDs
                const taxZoneCode = getStringValue(rec, defaultTaxZoneCodeField);
                const shippingZoneCode = getStringValue(rec, defaultShippingZoneCodeField);
                const sellerId = getStringValue(rec, sellerIdField);
                const customFieldsKey = cfg.customFieldsField ?? 'customFields';
                const customFields = getObjectValue(rec, customFieldsKey);

                const defaultTaxZoneId = taxZoneCode ? this.resolveZoneId(taxZoneCode) : undefined;
                const defaultShippingZoneId = shippingZoneCode ? this.resolveZoneId(shippingZoneCode) : undefined;

                const existing = this.findExistingByCode(ctx, code, channelByCode);
                const strategy = cfg.strategy ?? LoadStrategy.UPSERT;

                if (existing) {
                    if (strategy === LoadStrategy.CREATE) {
                        ok++;
                        continue;
                    }
                    const updateInput: Record<string, unknown> = {
                        id: existing.id,
                        code,
                        defaultLanguageCode,
                        availableLanguageCodes,
                        defaultCurrencyCode,
                        availableCurrencyCodes,
                        pricesIncludeTax,
                    };
                    if (defaultTaxZoneId) updateInput.defaultTaxZoneId = defaultTaxZoneId;
                    if (defaultShippingZoneId) updateInput.defaultShippingZoneId = defaultShippingZoneId;
                    if (customFields) updateInput.customFields = customFields;

                    await this.channelService.update(
                        ctx,
                        updateInput as Parameters<typeof this.channelService.update>[1],
                    );
                } else {
                    if (strategy === LoadStrategy.UPDATE) {
                        fail++;
                        if (onRecordError) {
                            await onRecordError(step.key, `Channel not found for update: ${code}`, rec);
                        }
                        continue;
                    }
                    const createInput: Record<string, unknown> = {
                        code,
                        token,
                        defaultLanguageCode,
                        availableLanguageCodes,
                        defaultCurrencyCode,
                        availableCurrencyCodes,
                        pricesIncludeTax,
                    };
                    if (defaultTaxZoneId) createInput.defaultTaxZoneId = defaultTaxZoneId;
                    if (defaultShippingZoneId) createInput.defaultShippingZoneId = defaultShippingZoneId;
                    if (sellerId) createInput.sellerId = sellerId;
                    if (customFields) createInput.customFields = customFields;

                    const result = await this.channelService.create(
                        ctx,
                        createInput as Parameters<typeof this.channelService.create>[1],
                    );
                    // Handle ErrorResultUnion
                    if ('errorCode' in result) {
                        throw new Error(`Failed to create channel: ${'message' in result ? String(result.message) : 'Unknown error'}`);
                    }
                }
                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'channelUpsert failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    private findExistingByCode(_ctx: RequestContext, code: string, channelByCode: Map<string, { id: ID; code: string }>): { id: ID } | null {
        const match = channelByCode.get(code);
        return match ? { id: match.id } : null;
    }

    private resolveZoneId(code: string): ID | undefined {
        return this.zoneCache.get(code.toLowerCase());
    }
}

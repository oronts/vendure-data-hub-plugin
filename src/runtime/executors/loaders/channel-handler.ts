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
import { getErrorMessage } from '../../../utils/error.utils';
import { getStringValue, getArrayValue } from '../../../loaders/shared-helpers';

/**
 * Configuration for the channel handler step (mirrors loader-adapters.ts schema)
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
}

/**
 * Safely extract config from step.config
 */
function getConfig(config: JsonObject): ChannelHandlerConfig {
    return config as unknown as ChannelHandlerConfig;
}

/**
 * Parse and validate a 3-letter currency code
 */
function parseCurrencyCode(code: string): CurrencyCode | null {
    const normalized = code.toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(normalized)) return null;
    return normalized as CurrencyCode;
}

/**
 * Parse and validate a 2-letter language code
 */
function parseLanguageCode(code: string): LanguageCode | null {
    const normalized = code.toLowerCase().trim();
    if (!/^[a-z]{2}$/.test(normalized)) return null;
    return normalized as LanguageCode;
}

/**
 * Generate a channel token from code
 */
function generateChannelToken(code: string): string {
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `${code.toLowerCase().replace(/[^a-z0-9]/g, '')}_${randomPart}`;
}

@Injectable()
export class ChannelHandler implements LoaderHandler {
    private zoneCache = new Map<string, ID>();

    constructor(
        private channelService: ChannelService,
        private zoneService: ZoneService,
    ) {}

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

                // Ensure defaults are included
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

                const defaultTaxZoneId = taxZoneCode ? await this.resolveZoneId(ctx, taxZoneCode) : undefined;
                const defaultShippingZoneId = shippingZoneCode ? await this.resolveZoneId(ctx, shippingZoneCode) : undefined;

                // Find existing channel by code
                const existing = await this.findExistingByCode(ctx, code);

                if (existing) {
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

                    await this.channelService.update(
                        ctx,
                        updateInput as Parameters<typeof this.channelService.update>[1],
                    );
                } else {
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
                    await onRecordError(step.key, getErrorMessage(e) || 'channelUpsert failed', rec);
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    private async findExistingByCode(ctx: RequestContext, code: string): Promise<{ id: ID } | null> {
        const channels = await this.channelService.findAll(ctx);
        const channelsList = channels as unknown as Array<{ id: ID; code: string }>;
        const match = channelsList.find(c => c.code === code);
        return match ? { id: match.id } : null;
    }

    private async resolveZoneId(ctx: RequestContext, code: string): Promise<ID | undefined> {
        if (this.zoneCache.has(code)) {
            return this.zoneCache.get(code);
        }

        const zones = await this.zoneService.findAll(ctx);
        const match = zones.items.find(z => z.name.toLowerCase() === code.toLowerCase());
        if (match) {
            this.zoneCache.set(code, match.id);
            return match.id;
        }
        return undefined;
    }
}

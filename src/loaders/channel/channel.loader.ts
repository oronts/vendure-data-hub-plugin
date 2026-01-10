import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    ChannelService,
    ZoneService,
    CurrencyCode,
    LanguageCode,
} from '@vendure/core';
import {
    EntityLoader,
    LoaderContext,
    EntityLoadResult,
    EntityValidationResult,
    EntityFieldSchema,
} from '../../types/index';
import { TargetOperation } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import {
    ChannelInput,
    ExistingEntityResult,
    CHANNEL_LOADER_METADATA,
} from './types';
import {
    resolveZoneId,
    parseCurrencyCode,
    parseLanguageCode,
    parseCurrencyCodes,
    parseLanguageCodes,
    generateChannelToken,
    isRecoverableError,
    shouldUpdateField,
} from './helpers';

/**
 * Channel Loader
 *
 * Imports channels into Vendure with support for:
 * - Multiple currencies and languages
 * - Tax and shipping zone configuration
 * - Automatic token generation
 *
 * Channels represent different storefronts, markets, or sales channels.
 *
 * @example
 * ```typescript
 * const channelInput: ChannelInput = {
 *   code: 'uk-store',
 *   defaultLanguageCode: 'en',
 *   availableLanguageCodes: ['en', 'fr'],
 *   defaultCurrencyCode: 'GBP',
 *   availableCurrencyCodes: ['GBP', 'EUR'],
 *   pricesIncludeTax: true,
 *   defaultTaxZoneCode: 'UK',
 *   defaultShippingZoneCode: 'UK',
 * };
 * ```
 */
@Injectable()
export class ChannelLoader implements EntityLoader<ChannelInput> {
    private readonly logger: DataHubLogger;

    readonly entityType = CHANNEL_LOADER_METADATA.entityType;
    readonly name = CHANNEL_LOADER_METADATA.name;
    readonly description = CHANNEL_LOADER_METADATA.description;
    readonly supportedOperations: TargetOperation[] = [...CHANNEL_LOADER_METADATA.supportedOperations];
    readonly lookupFields = [...CHANNEL_LOADER_METADATA.lookupFields];
    readonly requiredFields = [...CHANNEL_LOADER_METADATA.requiredFields];

    constructor(
        private _connection: TransactionalConnection,
        private channelService: ChannelService,
        private zoneService: ZoneService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CHANNEL_LOADER);
    }

    async load(context: LoaderContext, records: ChannelInput[]): Promise<EntityLoadResult> {
        const result: EntityLoadResult = {
            succeeded: 0,
            failed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            affectedIds: [],
        };

        // Cache for resolved zone IDs
        const zoneCache = new Map<string, ID>();

        for (const record of records) {
            try {
                const validation = await this.validate(context.ctx, record, context.operation);
                if (!validation.valid) {
                    result.failed++;
                    result.errors.push({
                        record,
                        message: validation.errors.map(e => e.message).join('; '),
                        recoverable: false,
                    });
                    continue;
                }

                // Resolve tax zone if specified
                let defaultTaxZoneId: ID | undefined;
                if (record.defaultTaxZoneCode || record.defaultTaxZoneId) {
                    const taxZoneId = await resolveZoneId(
                        context.ctx,
                        this.zoneService,
                        record.defaultTaxZoneCode,
                        record.defaultTaxZoneId,
                        zoneCache,
                    );
                    if (!taxZoneId) {
                        result.failed++;
                        result.errors.push({
                            record,
                            message: `Default tax zone "${record.defaultTaxZoneCode}" not found`,
                            code: 'TAX_ZONE_NOT_FOUND',
                            recoverable: false,
                        });
                        continue;
                    }
                    defaultTaxZoneId = taxZoneId;
                }

                // Resolve shipping zone if specified
                let defaultShippingZoneId: ID | undefined;
                if (record.defaultShippingZoneCode || record.defaultShippingZoneId) {
                    const shippingZoneId = await resolveZoneId(
                        context.ctx,
                        this.zoneService,
                        record.defaultShippingZoneCode,
                        record.defaultShippingZoneId,
                        zoneCache,
                    );
                    if (!shippingZoneId) {
                        result.failed++;
                        result.errors.push({
                            record,
                            message: `Default shipping zone "${record.defaultShippingZoneCode}" not found`,
                            code: 'SHIPPING_ZONE_NOT_FOUND',
                            recoverable: false,
                        });
                        continue;
                    }
                    defaultShippingZoneId = shippingZoneId;
                }

                const existing = await this.findExisting(context.ctx, context.lookupFields, record);

                if (existing) {
                    if (context.operation === 'CREATE') {
                        if (context.options.skipDuplicates) {
                            result.skipped++;
                            continue;
                        }
                        result.failed++;
                        result.errors.push({
                            record,
                            message: `Channel with code "${record.code}" already exists`,
                            code: 'DUPLICATE',
                            recoverable: false,
                        });
                        continue;
                    }

                    if (!context.dryRun) {
                        await this.updateChannel(
                            context,
                            existing.id,
                            record,
                            defaultTaxZoneId,
                            defaultShippingZoneId,
                        );
                    }
                    result.updated++;
                    result.affectedIds.push(existing.id);
                } else {
                    if (context.operation === 'UPDATE') {
                        result.skipped++;
                        continue;
                    }

                    if (!context.dryRun) {
                        const newId = await this.createChannel(
                            context,
                            record,
                            defaultTaxZoneId,
                            defaultShippingZoneId,
                        );
                        result.affectedIds.push(newId);
                    }
                    result.created++;
                }

                result.succeeded++;
            } catch (error) {
                result.failed++;
                result.errors.push({
                    record,
                    message: error instanceof Error ? error.message : String(error),
                    recoverable: isRecoverableError(error),
                });
                this.logger.error(`Failed to load channel`, error instanceof Error ? error : undefined);
            }
        }

        return result;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: ChannelInput,
    ): Promise<ExistingEntityResult | null> {
        // Primary lookup: by code
        if (record.code && lookupFields.includes('code')) {
            // ChannelService.findAll returns Channel[] directly
            const channels = await this.channelService.findAll(ctx);
            const channelsList = channels as unknown as Array<{ id: ID; code: string }>;
            const match = channelsList.find((c) => c.code === record.code);
            if (match) {
                const fullChannel = await this.channelService.findOne(ctx, match.id);
                if (fullChannel) {
                    return { id: fullChannel.id, entity: fullChannel };
                }
            }
        }

        // Fallback: by token
        if (record.token && lookupFields.includes('token')) {
            const channel = await this.channelService.getChannelFromToken(record.token);
            if (channel) {
                return { id: channel.id, entity: channel };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const channel = await this.channelService.findOne(ctx, record.id as ID);
            if (channel) {
                return { id: channel.id, entity: channel };
            }
        }

        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: ChannelInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === 'CREATE' || operation === 'UPSERT') {
            if (!record.code || typeof record.code !== 'string' || record.code.trim() === '') {
                errors.push({ field: 'code', message: 'Channel code is required', code: 'REQUIRED' });
            } else if (!/^[a-z0-9_-]+$/i.test(record.code)) {
                errors.push({
                    field: 'code',
                    message: 'Code must contain only letters, numbers, hyphens, and underscores',
                    code: 'INVALID_FORMAT',
                });
            }

            if (!record.defaultLanguageCode) {
                errors.push({
                    field: 'defaultLanguageCode',
                    message: 'Default language code is required',
                    code: 'REQUIRED',
                });
            } else {
                const langCode = parseLanguageCode(record.defaultLanguageCode);
                if (!langCode) {
                    errors.push({
                        field: 'defaultLanguageCode',
                        message: 'Invalid language code format (expected 2-letter code like "en")',
                        code: 'INVALID_FORMAT',
                    });
                }
            }

            if (!record.defaultCurrencyCode) {
                errors.push({
                    field: 'defaultCurrencyCode',
                    message: 'Default currency code is required',
                    code: 'REQUIRED',
                });
            } else {
                const currCode = parseCurrencyCode(record.defaultCurrencyCode);
                if (!currCode) {
                    errors.push({
                        field: 'defaultCurrencyCode',
                        message: 'Invalid currency code format (expected 3-letter code like "USD")',
                        code: 'INVALID_FORMAT',
                    });
                }
            }

            // Validate available language codes
            if (record.availableLanguageCodes) {
                for (const code of record.availableLanguageCodes) {
                    if (!parseLanguageCode(code)) {
                        warnings.push({
                            field: 'availableLanguageCodes',
                            message: `Invalid language code: ${code}`,
                        });
                    }
                }
            }

            // Validate available currency codes
            if (record.availableCurrencyCodes) {
                for (const code of record.availableCurrencyCodes) {
                    if (!parseCurrencyCode(code)) {
                        warnings.push({
                            field: 'availableCurrencyCodes',
                            message: `Invalid currency code: ${code}`,
                        });
                    }
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: 'Channel',
            fields: [
                {
                    key: 'code',
                    label: 'Channel Code',
                    type: 'string',
                    required: true,
                    lookupable: true,
                    description: 'Unique code for the channel',
                    example: 'uk-store',
                    validation: {
                        pattern: '^[a-z0-9_-]+$',
                    },
                },
                {
                    key: 'token',
                    label: 'Channel Token',
                    type: 'string',
                    lookupable: true,
                    description: 'Unique token for API requests (auto-generated if not provided)',
                    example: 'ukstore_abc123',
                },
                {
                    key: 'defaultLanguageCode',
                    label: 'Default Language',
                    type: 'string',
                    required: true,
                    description: 'Default language code (2-letter ISO code)',
                    example: 'en',
                },
                {
                    key: 'availableLanguageCodes',
                    label: 'Available Languages',
                    type: 'array',
                    description: 'List of available language codes',
                    example: ['en', 'fr', 'de'],
                },
                {
                    key: 'defaultCurrencyCode',
                    label: 'Default Currency',
                    type: 'string',
                    required: true,
                    description: 'Default currency code (3-letter ISO code)',
                    example: 'USD',
                },
                {
                    key: 'availableCurrencyCodes',
                    label: 'Available Currencies',
                    type: 'array',
                    description: 'List of available currency codes',
                    example: ['USD', 'EUR', 'GBP'],
                },
                {
                    key: 'pricesIncludeTax',
                    label: 'Prices Include Tax',
                    type: 'boolean',
                    description: 'Whether displayed prices include tax',
                    example: true,
                },
                {
                    key: 'defaultTaxZoneCode',
                    label: 'Default Tax Zone',
                    type: 'string',
                    description: 'Code/name of the default tax zone',
                    example: 'UK',
                },
                {
                    key: 'defaultShippingZoneCode',
                    label: 'Default Shipping Zone',
                    type: 'string',
                    description: 'Code/name of the default shipping zone',
                    example: 'Europe',
                },
                {
                    key: 'sellerId',
                    label: 'Seller ID',
                    type: 'string',
                    description: 'ID of the seller (for multi-vendor setups)',
                },
                {
                    key: 'customFields',
                    label: 'Custom Fields',
                    type: 'object',
                    description: 'Custom field values',
                },
            ],
        };
    }

    private async createChannel(
        context: LoaderContext,
        record: ChannelInput,
        defaultTaxZoneId?: ID,
        defaultShippingZoneId?: ID,
    ): Promise<ID> {
        const { ctx } = context;

        const defaultLanguageCode = parseLanguageCode(record.defaultLanguageCode) as LanguageCode;
        const defaultCurrencyCode = parseCurrencyCode(record.defaultCurrencyCode) as CurrencyCode;

        const availableLanguageCodes = record.availableLanguageCodes
            ? parseLanguageCodes(record.availableLanguageCodes)
            : [defaultLanguageCode];

        const availableCurrencyCodes = record.availableCurrencyCodes
            ? parseCurrencyCodes(record.availableCurrencyCodes)
            : [defaultCurrencyCode];

        // Ensure default codes are in available lists
        if (!availableLanguageCodes.includes(defaultLanguageCode)) {
            availableLanguageCodes.unshift(defaultLanguageCode);
        }
        if (!availableCurrencyCodes.includes(defaultCurrencyCode)) {
            availableCurrencyCodes.unshift(defaultCurrencyCode);
        }

        const createInput: Record<string, unknown> = {
            code: record.code,
            token: record.token || generateChannelToken(record.code),
            defaultLanguageCode,
            availableLanguageCodes,
            defaultCurrencyCode,
            availableCurrencyCodes,
            pricesIncludeTax: record.pricesIncludeTax ?? false,
            customFields: record.customFields as Record<string, unknown>,
        };

        if (defaultTaxZoneId) {
            createInput.defaultTaxZoneId = defaultTaxZoneId;
        }
        if (defaultShippingZoneId) {
            createInput.defaultShippingZoneId = defaultShippingZoneId;
        }
        if (record.sellerId) {
            createInput.sellerId = record.sellerId;
        }

        const channelResult = await this.channelService.create(ctx, createInput as Parameters<typeof this.channelService.create>[1]);

        // Handle ErrorResultUnion
        if ('errorCode' in channelResult) {
            throw new Error(`Failed to create channel: ${channelResult.message}`);
        }

        const channel = channelResult;
        this.logger.log(`Created channel ${record.code} (ID: ${channel.id})`);
        return channel.id;
    }

    private async updateChannel(
        context: LoaderContext,
        channelId: ID,
        record: ChannelInput,
        defaultTaxZoneId?: ID,
        defaultShippingZoneId?: ID,
    ): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: channelId };

        if (record.code !== undefined && shouldUpdateField('code', options.updateOnlyFields)) {
            updateInput.code = record.code;
        }

        if (record.defaultLanguageCode !== undefined && shouldUpdateField('defaultLanguageCode', options.updateOnlyFields)) {
            updateInput.defaultLanguageCode = parseLanguageCode(record.defaultLanguageCode);
        }

        if (record.availableLanguageCodes !== undefined && shouldUpdateField('availableLanguageCodes', options.updateOnlyFields)) {
            updateInput.availableLanguageCodes = parseLanguageCodes(record.availableLanguageCodes);
        }

        if (record.defaultCurrencyCode !== undefined && shouldUpdateField('defaultCurrencyCode', options.updateOnlyFields)) {
            updateInput.defaultCurrencyCode = parseCurrencyCode(record.defaultCurrencyCode);
        }

        if (record.availableCurrencyCodes !== undefined && shouldUpdateField('availableCurrencyCodes', options.updateOnlyFields)) {
            updateInput.availableCurrencyCodes = parseCurrencyCodes(record.availableCurrencyCodes);
        }

        if (record.pricesIncludeTax !== undefined && shouldUpdateField('pricesIncludeTax', options.updateOnlyFields)) {
            updateInput.pricesIncludeTax = record.pricesIncludeTax;
        }

        if (defaultTaxZoneId && shouldUpdateField('defaultTaxZoneId', options.updateOnlyFields)) {
            updateInput.defaultTaxZoneId = defaultTaxZoneId;
        }

        if (defaultShippingZoneId && shouldUpdateField('defaultShippingZoneId', options.updateOnlyFields)) {
            updateInput.defaultShippingZoneId = defaultShippingZoneId;
        }

        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        await this.channelService.update(ctx, updateInput as Parameters<typeof this.channelService.update>[1]);

        this.logger.debug(`Updated channel ${record.code} (ID: ${channelId})`);
    }
}

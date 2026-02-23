import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    ChannelService,
    ZoneService,
    CurrencyCode,
    LanguageCode,
    Channel,
} from '@vendure/core';
import {
    LoaderContext,
    EntityValidationResult,
    EntityFieldSchema,
    TargetOperation,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import {
    BaseEntityLoader,
    ExistingEntityLookupResult,
    LoaderMetadata,
    ValidationBuilder,
    EntityLookupHelper,
} from '../base';
import {
    ChannelInput,
    CHANNEL_LOADER_METADATA,
} from './types';
import {
    resolveZoneId,
    parseCurrencyCode,
    parseLanguageCode,
    parseCurrencyCodes,
    parseLanguageCodes,
    generateChannelToken,
    shouldUpdateField,
} from './helpers';

/**
 * Channel Loader - Refactored to extend BaseEntityLoader
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
export class ChannelLoader extends BaseEntityLoader<ChannelInput, Channel> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = CHANNEL_LOADER_METADATA;

    // Cache for resolved zone IDs to avoid repeated lookups
    private zoneCache = new Map<string, ID>();

    private readonly lookupHelper: EntityLookupHelper<ChannelService, Channel, ChannelInput>;

    constructor(
        private connection: TransactionalConnection,
        private channelService: ChannelService,
        private zoneService: ZoneService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CHANNEL_LOADER);
        this.lookupHelper = new EntityLookupHelper<ChannelService, Channel, ChannelInput>(this.channelService)
            .addCustomStrategy({
                fieldName: 'code',
                lookup: async (ctx, svc, value) => {
                    if (!value || typeof value !== 'string') return null;
                    const channels = await svc.findAll(ctx);
                    const channelsList = channels as unknown as Array<{ id: ID; code: string }>;
                    const match = channelsList.find((c) => c.code === value);
                    if (match) {
                        const fullChannel = await svc.findOne(ctx, match.id);
                        if (fullChannel) {
                            return { id: fullChannel.id, entity: fullChannel };
                        }
                    }
                    return null;
                },
            })
            .addCustomStrategy({
                fieldName: 'token',
                lookup: async (_ctx, svc, value) => {
                    if (!value || typeof value !== 'string') return null;
                    const channel = await svc.getChannelFromToken(value);
                    if (channel) {
                        return { id: channel.id, entity: channel };
                    }
                    return null;
                },
            })
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id));
    }

    protected preprocessRecords(records: ChannelInput[]): ChannelInput[] {
        this.zoneCache.clear();
        return records;
    }

    protected getDuplicateErrorMessage(record: ChannelInput): string {
        return `Channel with code "${record.code}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: ChannelInput,
    ): Promise<ExistingEntityLookupResult<Channel> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        ctx: RequestContext,
        record: ChannelInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const builder = new ValidationBuilder()
            .requireStringForCreate('code', record.code, operation, 'Channel code is required');

        if (
            (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) &&
            record.code && typeof record.code === 'string' && record.code.trim() !== '' &&
            !/^[a-z0-9_-]+$/i.test(record.code)
        ) {
            builder.addError(
                'code',
                'Code must contain only letters, numbers, hyphens, and underscores',
                'INVALID_FORMAT',
            );
        }

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            // Default language code validation
            if (!record.defaultLanguageCode) {
                builder.addError('defaultLanguageCode', 'Default language code is required', 'REQUIRED');
            } else {
                const langCode = parseLanguageCode(record.defaultLanguageCode);
                if (!langCode) {
                    builder.addError(
                        'defaultLanguageCode',
                        'Invalid language code format (expected 2-letter code like "en")',
                        'INVALID_FORMAT',
                    );
                }
            }

            // Default currency code validation
            if (!record.defaultCurrencyCode) {
                builder.addError('defaultCurrencyCode', 'Default currency code is required', 'REQUIRED');
            } else {
                const currCode = parseCurrencyCode(record.defaultCurrencyCode);
                if (!currCode) {
                    builder.addError(
                        'defaultCurrencyCode',
                        'Invalid currency code format (expected 3-letter code like "USD")',
                        'INVALID_FORMAT',
                    );
                }
            }

            // Validate available language codes
            if (record.availableLanguageCodes) {
                for (const code of record.availableLanguageCodes) {
                    if (!parseLanguageCode(code)) {
                        builder.addWarning('availableLanguageCodes', `Invalid language code: ${code}`);
                    }
                }
            }

            // Validate available currency codes
            if (record.availableCurrencyCodes) {
                for (const code of record.availableCurrencyCodes) {
                    if (!parseCurrencyCode(code)) {
                        builder.addWarning('availableCurrencyCodes', `Invalid currency code: ${code}`);
                    }
                }
            }

            // Validate zone references exist
            if (record.defaultTaxZoneCode || record.defaultTaxZoneId) {
                const taxZoneId = await resolveZoneId(
                    ctx,
                    this.zoneService,
                    record.defaultTaxZoneCode,
                    record.defaultTaxZoneId,
                    this.zoneCache,
                );
                if (!taxZoneId) {
                    builder.addError(
                        'defaultTaxZoneCode',
                        `Default tax zone "${record.defaultTaxZoneCode}" not found`,
                        'TAX_ZONE_NOT_FOUND',
                    );
                }
            }

            if (record.defaultShippingZoneCode || record.defaultShippingZoneId) {
                const shippingZoneId = await resolveZoneId(
                    ctx,
                    this.zoneService,
                    record.defaultShippingZoneCode,
                    record.defaultShippingZoneId,
                    this.zoneCache,
                );
                if (!shippingZoneId) {
                    builder.addError(
                        'defaultShippingZoneCode',
                        `Default shipping zone "${record.defaultShippingZoneCode}" not found`,
                        'SHIPPING_ZONE_NOT_FOUND',
                    );
                }
            }
        }

        return builder.build();
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.CHANNEL,
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

    protected async createEntity(context: LoaderContext, record: ChannelInput): Promise<ID | null> {
        const { ctx } = context;

        // Resolve zone IDs
        let defaultTaxZoneId: ID | undefined;
        if (record.defaultTaxZoneCode || record.defaultTaxZoneId) {
            const taxZoneId = await resolveZoneId(
                ctx,
                this.zoneService,
                record.defaultTaxZoneCode,
                record.defaultTaxZoneId,
                this.zoneCache,
            );
            if (!taxZoneId) {
                this.logger.error(`Default tax zone "${record.defaultTaxZoneCode}" not found during create`);
                return null;
            }
            defaultTaxZoneId = taxZoneId;
        }

        let defaultShippingZoneId: ID | undefined;
        if (record.defaultShippingZoneCode || record.defaultShippingZoneId) {
            const shippingZoneId = await resolveZoneId(
                ctx,
                this.zoneService,
                record.defaultShippingZoneCode,
                record.defaultShippingZoneId,
                this.zoneCache,
            );
            if (!shippingZoneId) {
                this.logger.error(`Default shipping zone "${record.defaultShippingZoneCode}" not found during create`);
                return null;
            }
            defaultShippingZoneId = shippingZoneId;
        }

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

    protected async updateEntity(context: LoaderContext, channelId: ID, record: ChannelInput): Promise<void> {
        const { ctx, options } = context;

        // Resolve zone IDs if needed
        let defaultTaxZoneId: ID | undefined;
        if ((record.defaultTaxZoneCode || record.defaultTaxZoneId) && shouldUpdateField('defaultTaxZoneId', options.updateOnlyFields)) {
            defaultTaxZoneId = await resolveZoneId(
                ctx,
                this.zoneService,
                record.defaultTaxZoneCode,
                record.defaultTaxZoneId,
                this.zoneCache,
            ) || undefined;
        }

        let defaultShippingZoneId: ID | undefined;
        if ((record.defaultShippingZoneCode || record.defaultShippingZoneId) && shouldUpdateField('defaultShippingZoneId', options.updateOnlyFields)) {
            defaultShippingZoneId = await resolveZoneId(
                ctx,
                this.zoneService,
                record.defaultShippingZoneCode,
                record.defaultShippingZoneId,
                this.zoneCache,
            ) || undefined;
        }

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

        if (defaultTaxZoneId) {
            updateInput.defaultTaxZoneId = defaultTaxZoneId;
        }

        if (defaultShippingZoneId) {
            updateInput.defaultShippingZoneId = defaultShippingZoneId;
        }

        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        await this.channelService.update(ctx, updateInput as Parameters<typeof this.channelService.update>[1]);

        this.logger.debug(`Updated channel ${record.code} (ID: ${channelId})`);
    }
}

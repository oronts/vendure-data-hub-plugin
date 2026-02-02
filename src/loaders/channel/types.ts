import { ID, Channel } from '@vendure/core';
import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

/**
 * Channel Input for data import
 *
 * Represents the input data structure for creating or updating channels.
 * Channels in Vendure represent different storefronts, markets, or sales channels.
 */
export interface ChannelInput extends InputRecord {
    /** Unique code for the channel */
    code: string;

    /** Channel token (unique identifier used in API requests) */
    token?: string;

    /** Default language code for this channel */
    defaultLanguageCode: string;

    /** Available language codes for this channel */
    availableLanguageCodes?: string[];

    /** Default currency code for this channel */
    defaultCurrencyCode: string;

    /** Available currency codes for this channel */
    availableCurrencyCodes?: string[];

    /** Whether prices include tax by default */
    pricesIncludeTax?: boolean;

    /** Code of the default tax zone */
    defaultTaxZoneCode?: string;

    /** ID of the default tax zone (alternative to defaultTaxZoneCode) */
    defaultTaxZoneId?: string | number;

    /** Code of the default shipping zone */
    defaultShippingZoneCode?: string;

    /** ID of the default shipping zone (alternative to defaultShippingZoneCode) */
    defaultShippingZoneId?: string | number;

    /** ID of the seller (for multi-vendor setups) */
    sellerId?: string | number;

    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export interface ExistingEntityResult {
    id: ID;
    entity: Channel;
}

export const CHANNEL_LOADER_METADATA = {
    entityType: VendureEntityType.CHANNEL,
    name: 'Channel Loader',
    description: 'Imports channels/storefronts with currency, language, and zone settings',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['code', 'token', 'id'],
    requiredFields: ['code', 'defaultLanguageCode', 'defaultCurrencyCode'],
} as const;

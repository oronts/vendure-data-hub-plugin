/**
 * Alias Match Strategy
 *
 * Matches field names against known aliases
 */

import { MappingStrategy, NameScoreResult } from '../types/index';

/**
 * Common field name aliases for better matching (built-in defaults)
 */
export const DEFAULT_FIELD_ALIASES: Record<string, string[]> = {
    // Product fields
    name: ['title', 'product_name', 'productname', 'item_name', 'itemname', 'label'],
    sku: ['product_code', 'productcode', 'item_code', 'itemcode', 'code', 'article_number', 'articlenumber', 'part_number'],
    slug: ['url_key', 'urlkey', 'permalink', 'handle', 'seo_url'],
    description: ['desc', 'product_description', 'body', 'content', 'long_description', 'details'],
    price: ['unit_price', 'unitprice', 'cost', 'amount', 'regular_price', 'retail_price'],
    enabled: ['active', 'is_active', 'status', 'visible', 'published'],

    // Customer fields
    firstName: ['first_name', 'firstname', 'fname', 'given_name'],
    lastName: ['last_name', 'lastname', 'lname', 'surname', 'family_name'],
    email: ['email_address', 'emailaddress', 'e_mail', 'mail'],
    phone: ['phone_number', 'phonenumber', 'telephone', 'mobile', 'cell'],

    // Address fields
    streetLine1: ['address', 'address1', 'street', 'street_address', 'line1'],
    streetLine2: ['address2', 'apartment', 'suite', 'unit', 'line2'],
    city: ['town', 'locality'],
    province: ['state', 'region', 'county'],
    postalCode: ['zip', 'zipcode', 'zip_code', 'postcode', 'post_code'],
    country: ['country_code', 'countrycode', 'nation'],

    // Order fields
    orderCode: ['order_number', 'ordernumber', 'order_id', 'orderid', 'transaction_id'],
    totalWithTax: ['total', 'grand_total', 'order_total', 'amount'],

    // Common fields
    id: ['identifier', 'uid', 'guid', 'external_id', 'externalid'],
    createdAt: ['created', 'created_date', 'date_created', 'creation_date'],
    updatedAt: ['updated', 'modified', 'updated_date', 'date_modified', 'last_modified'],
};

export class AliasMatchStrategy implements MappingStrategy {
    private aliasToCanonical = new Map<string, string>();
    private fieldAliases: Record<string, string[]>;
    private caseSensitive: boolean;

    constructor(
        customAliases: Record<string, string[]> = {},
        caseSensitive: boolean = false,
    ) {
        this.caseSensitive = caseSensitive;
        this.fieldAliases = { ...DEFAULT_FIELD_ALIASES };
        this.mergeCustomAliases(customAliases);
        this.buildAliasMap();
    }

    /**
     * Merge custom aliases with defaults
     */
    mergeCustomAliases(customAliases: Record<string, string[]>): void {
        for (const [canonical, aliases] of Object.entries(customAliases)) {
            if (this.fieldAliases[canonical]) {
                // Merge with existing aliases
                this.fieldAliases[canonical] = [
                    ...this.fieldAliases[canonical],
                    ...aliases.filter(a => !this.fieldAliases[canonical].includes(a)),
                ];
            } else {
                this.fieldAliases[canonical] = [...aliases];
            }
        }
        this.buildAliasMap();
    }

    /**
     * Build reverse lookup map
     */
    private buildAliasMap(): void {
        this.aliasToCanonical.clear();
        for (const [canonical, aliases] of Object.entries(this.fieldAliases)) {
            for (const alias of aliases) {
                const key = this.caseSensitive ? alias : alias.toLowerCase();
                this.aliasToCanonical.set(key, canonical);
            }
        }
    }

    /**
     * Update case sensitivity and rebuild map
     */
    setCaseSensitive(caseSensitive: boolean): void {
        this.caseSensitive = caseSensitive;
        this.buildAliasMap();
    }

    /**
     * Check if a source name is a known alias for a target field
     */
    isAlias(sourceKey: string, targetKey: string): boolean {
        // Use the alias map which includes custom aliases
        const canonical = this.aliasToCanonical.get(sourceKey);
        if (canonical === targetKey) return true;

        // Also check direct lookup in merged aliases
        const aliases = this.fieldAliases[targetKey];
        if (aliases) {
            for (const alias of aliases) {
                const aliasKey = this.caseSensitive ? alias : alias.toLowerCase();
                if (aliasKey === sourceKey) return true;
            }
        }

        return false;
    }

    match(
        sourceForComparison: string,
        _sourceNormalized: string,
        _targetForComparison: string,
        _targetNormalized: string,
        targetKey: string,
    ): NameScoreResult | null {
        if (this.isAlias(sourceForComparison, targetKey)) {
            return { score: 90, reason: 'Known alias match' };
        }
        return null;
    }
}

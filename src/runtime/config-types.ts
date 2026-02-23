/**
 * Base step configuration for runtime execution.
 * `adapterCode` is optional because some inline runtime transforms
 * (e.g., set, remove, rename) don't use named adapters.
 *
 * @see src/types/step-configs.ts BaseStepConfig - pipeline definition variant
 *   where `adapterCode` is required since definitions must reference an adapter.
 */
export interface BaseStepConfig {
    /** Adapter code identifying the operation */
    adapterCode?: string;
}

export interface BaseFeedConfig extends BaseStepConfig {
    /** Output file path */
    outputPath?: string;
    /** Field for product title */
    titleField?: string;
    /** Field for description */
    descriptionField?: string;
    /** Field for price */
    priceField?: string;
    /** Field for image URL */
    imageField?: string;
    /** Field for product link */
    linkField?: string;
    /** Field for brand */
    brandField?: string;
    /** Field for GTIN/barcode */
    gtinField?: string;
    /** Field for availability status */
    availabilityField?: string;
    /** Currency code */
    currency?: string;
    /** Alias for currency (for compatibility) */
    currencyCode?: string;
    /** Channel ID for feed context */
    channelId?: string;
    /** Language code for translations */
    languageCode?: string;
}

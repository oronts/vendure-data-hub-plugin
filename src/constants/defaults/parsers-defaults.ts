/**
 * Data parsing and format defaults
 */

/**
 * XML parser defaults
 */
export const XML_PARSER = {
    /** Default attribute prefix for XML parsing */
    DEFAULT_ATTR_PREFIX: '@',
    /** Default tag names to search for records */
    DEFAULT_RECORD_TAGS: ['item', 'record', 'row', 'product', 'customer', 'order', 'entry'] as readonly string[],
    /** Maximum tag name length to prevent ReDoS */
    MAX_TAG_NAME_LENGTH: 100,
} as const;

/**
 * Validation field defaults
 */
export const VALIDATION_FIELDS = {
    /** Default field name for validation errors */
    DEFAULT_ERROR_FIELD: '_validationErrors',
} as const;

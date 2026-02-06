/**
 * Mapper transform constants
 */

/** Boolean value mappings for conversion */
export const BOOLEAN_MAPPINGS: Record<string, boolean> = {
    yes: true,
    no: false,
    true: true,
    false: false,
    '1': true,
    '0': false,
    active: true,
    inactive: false,
    enabled: true,
    disabled: false,
};

/** Values that indicate a boolean field */
export const BOOLEAN_DETECTOR_VALUES = ['yes', 'no', 'true', 'false', '1', '0', 'active', 'inactive'];

/** ISO date pattern for detection */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

/** Normalization patterns */
export const SEPARATOR_PATTERN = /[-_\s]+/g;
export const CAMEL_CASE_PATTERN = /([a-z])([A-Z])/g;

/**
 * DataHub Default Configuration Values
 */

import { DataHubPluginOptions } from '../types/index';
import { RETENTION } from '../constants/index';

/**
 * Default plugin options
 */
export const DEFAULT_PLUGIN_OPTIONS: DataHubPluginOptions = {
    enabled: true,
    registerBuiltinAdapters: true,
    retentionDaysRuns: RETENTION.RUNS_DAYS,
    retentionDaysErrors: RETENTION.ERRORS_DAYS,
    debug: false,
};

/**
 * AutoMapper defaults
 */
export const DEFAULT_AUTOMAPPER_CONFIG = {
    /** Minimum confidence score for auto-mapping suggestions */
    CONFIDENCE_THRESHOLD: 0.7,
    /** Enable fuzzy matching for field names */
    ENABLE_FUZZY_MATCHING: true,
    /** Enable type inference from sample data */
    ENABLE_TYPE_INFERENCE: true,
    /** Case-sensitive field matching */
    CASE_SENSITIVE: false,
} as const;

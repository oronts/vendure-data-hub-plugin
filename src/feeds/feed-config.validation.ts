import { FIELD_LIMITS, VALIDATION_PATTERNS } from '../constants';
import { isValidTimezone } from '../jobs/processors/cron-processor';
import { isValidCron } from '../../shared/utils/validation';
import type { CustomFeedGenerator, FeedConfig } from './generators/feed-types';

const VALID_BUILT_IN_FORMATS = [
    'google_shopping',
    'facebook_catalog',
    'meta_catalog',
    'csv',
    'json',
    'xml',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFeedMapping(value: unknown): boolean {
    if (typeof value === 'string') return value.length > 0;
    if (!isRecord(value) || typeof value.source !== 'string' || value.source.length === 0) {
        return false;
    }
    const defaultValue = value.default;
    return defaultValue === undefined
        || defaultValue === null
        || typeof defaultValue === 'string'
        || typeof defaultValue === 'boolean'
        || (typeof defaultValue === 'number' && Number.isFinite(defaultValue));
}

export class FeedConfigValidationError extends Error {
    constructor(
        message: string,
        public readonly field: string,
        public readonly value?: unknown,
    ) {
        super(message);
        this.name = 'FeedConfigValidationError';
    }
}

export function validateFeedConfig(
    config: FeedConfig,
    customGenerators: ReadonlyMap<string, CustomFeedGenerator>,
): void {
    if (!config.code || typeof config.code !== 'string') {
        throw new FeedConfigValidationError(
            'Feed code is required and must be a string',
            'code',
            config.code,
        );
    }
    if (!VALIDATION_PATTERNS.SLUG.test(config.code)) {
        throw new FeedConfigValidationError(
            'Feed code must contain only alphanumeric characters, underscores, and hyphens',
            'code',
            config.code,
        );
    }
    if (config.code.length > FIELD_LIMITS.CODE_MAX) {
        throw new FeedConfigValidationError(
            `Feed code must not exceed ${FIELD_LIMITS.CODE_MAX} characters`,
            'code',
            config.code,
        );
    }
    if (!config.name || typeof config.name !== 'string') {
        throw new FeedConfigValidationError(
            'Feed name is required and must be a string',
            'name',
            config.name,
        );
    }
    if (config.name.length > FIELD_LIMITS.NAME_MAX) {
        throw new FeedConfigValidationError(
            `Feed name must not exceed ${FIELD_LIMITS.NAME_MAX} characters`,
            'name',
            config.name,
        );
    }
    if (!config.format || typeof config.format !== 'string') {
        throw new FeedConfigValidationError(
            'Feed format is required and must be a string',
            'format',
            config.format,
        );
    }

    const normalizedFormat = config.format.toLowerCase();
    if (normalizedFormat === 'custom') {
        if (!config.customGeneratorCode) {
            throw new FeedConfigValidationError(
                'customGeneratorCode is required when format is "custom"',
                'customGeneratorCode',
                config.customGeneratorCode,
            );
        }
        if (!customGenerators.has(config.customGeneratorCode)) {
            throw new FeedConfigValidationError(
                `Custom generator "${config.customGeneratorCode}" is not registered. Available: ${Array.from(customGenerators.keys()).join(', ') || 'none'}`,
                'customGeneratorCode',
                config.customGeneratorCode,
            );
        }
    } else if (!VALID_BUILT_IN_FORMATS.includes(
        normalizedFormat as typeof VALID_BUILT_IN_FORMATS[number],
    )) {
        throw new FeedConfigValidationError(
            `Unsupported feed format "${config.format}". Supported formats: ${VALID_BUILT_IN_FORMATS.join(', ')}, custom`,
            'format',
            config.format,
        );
    }

    if (config.options !== undefined && !isRecord(config.options)) {
        throw new FeedConfigValidationError(
            'options must be an object',
            'options',
            config.options,
        );
    }
    if (
        config.options?.baseUrl !== undefined
        && (
            typeof config.options.baseUrl !== 'string'
            || !VALIDATION_PATTERNS.URL.test(config.options.baseUrl)
        )
    ) {
        throw new FeedConfigValidationError(
            'baseUrl must be a valid URL',
            'options.baseUrl',
            config.options.baseUrl,
        );
    }
    if (
        config.options?.currency !== undefined
        && (
            typeof config.options.currency !== 'string'
            || !/^[A-Z]{3}$/.test(config.options.currency)
        )
    ) {
        throw new FeedConfigValidationError(
            'currency must be an uppercase ISO 4217 code',
            'options.currency',
            config.options.currency,
        );
    }
    if (
        config.options?.language !== undefined
        && (
            typeof config.options.language !== 'string'
            || !/^[a-zA-Z0-9_-]+$/.test(config.options.language)
        )
    ) {
        throw new FeedConfigValidationError(
            'language must be a valid language code',
            'options.language',
            config.options.language,
        );
    }
    if (
        config.options?.imageSize !== undefined
        && config.options.imageSize !== 'preview'
        && config.options.imageSize !== 'original'
    ) {
        throw new FeedConfigValidationError(
            'imageSize must be "preview" or "original"',
            'options.imageSize',
            config.options.imageSize,
        );
    }
    if (
        config.options?.includeVariants !== undefined
        && typeof config.options.includeVariants !== 'boolean'
    ) {
        throw new FeedConfigValidationError(
            'includeVariants must be a boolean',
            'options.includeVariants',
            config.options.includeVariants,
        );
    }
    if (
        config.options?.utmParams !== undefined
        && (
            !isRecord(config.options.utmParams)
            || Object.values(config.options.utmParams).some(value => typeof value !== 'string')
        )
    ) {
        throw new FeedConfigValidationError(
            'utmParams must be an object with string values',
            'options.utmParams',
            config.options.utmParams,
        );
    }
    if (config.filters !== undefined && !isRecord(config.filters)) {
        throw new FeedConfigValidationError(
            'filters must be an object',
            'filters',
            config.filters,
        );
    }
    if (config.filters && Object.prototype.hasOwnProperty.call(config.filters, 'customFilter')) {
        throw new FeedConfigValidationError(
            'customFilter is not supported; use explicit feed filters',
            'filters.customFilter',
            Reflect.get(config.filters, 'customFilter'),
        );
    }
    for (const field of ['enabled', 'inStock', 'hasPrice'] as const) {
        const value = config.filters?.[field];
        if (value !== undefined && typeof value !== 'boolean') {
            throw new FeedConfigValidationError(
                `${field} must be a boolean`,
                `filters.${field}`,
                value,
            );
        }
    }
    for (const field of ['categories', 'excludeCategories'] as const) {
        const values = config.filters?.[field];
        if (
            values !== undefined
            && (!Array.isArray(values) || values.some(value => typeof value !== 'string'))
        ) {
            throw new FeedConfigValidationError(
                `${field} must be an array of collection slugs`,
                `filters.${field}`,
                values,
            );
        }
    }
    const minPrice = config.filters?.minPrice;
    const maxPrice = config.filters?.maxPrice;
    if (
        minPrice !== undefined
        && (typeof minPrice !== 'number' || !Number.isFinite(minPrice) || minPrice < 0)
    ) {
        throw new FeedConfigValidationError(
            'minPrice must be a non-negative number',
            'filters.minPrice',
            minPrice,
        );
    }
    if (
        maxPrice !== undefined
        && (typeof maxPrice !== 'number' || !Number.isFinite(maxPrice) || maxPrice < 0)
    ) {
        throw new FeedConfigValidationError(
            'maxPrice must be a non-negative number',
            'filters.maxPrice',
            maxPrice,
        );
    }
    if (
        typeof minPrice === 'number'
        && typeof maxPrice === 'number'
        && minPrice > maxPrice
    ) {
        throw new FeedConfigValidationError(
            'minPrice cannot be greater than maxPrice',
            'filters.minPrice',
            {
                minPrice,
                maxPrice,
            },
        );
    }
    if (
        config.fieldMappings !== undefined
        && (
            !isRecord(config.fieldMappings)
            || Object.entries(config.fieldMappings).some(
                ([header, mapping]) => header.length === 0 || !isFeedMapping(mapping),
            )
        )
    ) {
        throw new FeedConfigValidationError(
            'fieldMappings must map non-empty headers to field paths or mapping objects',
            'fieldMappings',
            config.fieldMappings,
        );
    }
    if (config.schedule === undefined) return;
    if (!isRecord(config.schedule) || typeof config.schedule.enabled !== 'boolean') {
        throw new FeedConfigValidationError(
            'schedule must be an object with a boolean enabled value',
            'schedule.enabled',
            config.schedule,
        );
    }
    if (
        config.schedule.timezone !== undefined
        && typeof config.schedule.timezone !== 'string'
    ) {
        throw new FeedConfigValidationError(
            'timezone must be an IANA timezone string',
            'schedule.timezone',
            config.schedule.timezone,
        );
    }
    if (!config.schedule.enabled) return;
    if (!config.schedule.cron || !isValidCron(config.schedule.cron)) {
        throw new FeedConfigValidationError(
            'Invalid cron expression: must be a valid 5-field cron (minute hour day month weekday)',
            'schedule.cron',
            config.schedule.cron,
        );
    }
    if (config.schedule.timezone && !isValidTimezone(config.schedule.timezone)) {
        throw new FeedConfigValidationError(
            'Invalid IANA timezone',
            'schedule.timezone',
            config.schedule.timezone,
        );
    }
}

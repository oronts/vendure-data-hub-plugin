import type { DataHubFeed, DataHubFeedInput } from '../../gql/graphql';
import { DataHubFeedFormat } from '../../gql/graphql';
import { isValidCron, isValidUrl } from '../../../shared';
import { FEED_TRANSLATION_IDS } from '../../constants/feed-labels';

const FEED_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FEED_CODE_MAX_LENGTH = 50;
const FEED_NAME_MAX_LENGTH = 255;

export interface FeedFormValues {
    code: string;
    name: string;
    format: DataHubFeedFormat;
    customGeneratorCode: string;
    filters: string;
    fieldMappings: string;
    options: string;
    scheduleEnabled: boolean;
    scheduleCron: string;
    scheduleTimezone: string;
}

export type FeedFormErrors = Partial<Record<keyof FeedFormValues, string>>;

type TranslationValues = Record<string, string | number>;
export type FeedFormTranslate = (id: string, values?: TranslationValues) => string;

export const DEFAULT_FEED_FORM_VALUES: FeedFormValues = {
    code: '',
    name: '',
    format: DataHubFeedFormat.GOOGLE_SHOPPING,
    customGeneratorCode: '',
    filters: '',
    fieldMappings: '',
    options: '',
    scheduleEnabled: false,
    scheduleCron: '',
    scheduleTimezone: '',
};

class InvalidJsonObjectError extends Error {}

function serializeJson(value: unknown): string {
    return value == null ? '' : JSON.stringify(value, null, 2);
}

export function feedToFormValues(feed: DataHubFeed): FeedFormValues {
    return {
        code: feed.code,
        name: feed.name,
        format: feed.format,
        customGeneratorCode: feed.customGeneratorCode ?? '',
        filters: serializeJson(feed.filters),
        fieldMappings: serializeJson(feed.fieldMappings),
        options: serializeJson(feed.options),
        scheduleEnabled: feed.schedule?.enabled ?? false,
        scheduleCron: feed.schedule?.cron ?? '',
        scheduleTimezone: feed.schedule?.timezone ?? '',
    };
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
    if (!value.trim()) return undefined;
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new InvalidJsonObjectError();
    }
    return parsed as Record<string, unknown>;
}

function validateJsonObject(
    value: string,
    translate: FeedFormTranslate,
): string | undefined {
    try {
        parseJsonObject(value);
        return undefined;
    } catch (error) {
        return translate(
            error instanceof SyntaxError
                ? FEED_TRANSLATION_IDS.VALIDATION_INVALID_JSON
                : FEED_TRANSLATION_IDS.VALIDATION_JSON_OBJECT,
        );
    }
}

function validateFilters(
    value: string,
    translate: FeedFormTranslate,
): string | undefined {
    const parseError = validateJsonObject(value, translate);
    if (parseError || !value.trim()) return parseError;
    const filters = parseJsonObject(value);
    const minPrice = filters?.minPrice;
    const maxPrice = filters?.maxPrice;
    if (minPrice !== undefined && (typeof minPrice !== 'number' || minPrice < 0)) {
        return translate(FEED_TRANSLATION_IDS.VALIDATION_MIN_PRICE);
    }
    if (maxPrice !== undefined && (typeof maxPrice !== 'number' || maxPrice < 0)) {
        return translate(FEED_TRANSLATION_IDS.VALIDATION_MAX_PRICE);
    }
    if (typeof minPrice === 'number' && typeof maxPrice === 'number' && minPrice > maxPrice) {
        return translate(FEED_TRANSLATION_IDS.VALIDATION_PRICE_RANGE);
    }
    return undefined;
}

function validateOptions(
    value: string,
    translate: FeedFormTranslate,
    requiresBaseUrl: boolean,
): string | undefined {
    const parseError = validateJsonObject(value, translate);
    if (parseError) return parseError;
    if (!value.trim()) {
        return requiresBaseUrl
            ? translate(FEED_TRANSLATION_IDS.VALIDATION_BASE_URL)
            : undefined;
    }
    const baseUrl = parseJsonObject(value)?.baseUrl;
    if (requiresBaseUrl && (typeof baseUrl !== 'string' || !baseUrl.trim())) {
        return translate(FEED_TRANSLATION_IDS.VALIDATION_BASE_URL);
    }
    if (baseUrl !== undefined && (typeof baseUrl !== 'string' || !isValidUrl(baseUrl))) {
        return translate(FEED_TRANSLATION_IDS.VALIDATION_BASE_URL);
    }
    return undefined;
}

function isValidTimezone(value: string): boolean {
    try {
        new Intl.DateTimeFormat('en', { timeZone: value }).format();
        return true;
    } catch {
        return false;
    }
}

export function validateFeedForm(
    values: FeedFormValues,
    translate: FeedFormTranslate,
): FeedFormErrors {
    const errors: FeedFormErrors = {};
    const code = values.code.trim();
    const name = values.name.trim();

    if (!code) errors.code = translate(FEED_TRANSLATION_IDS.VALIDATION_CODE_REQUIRED);
    else if (!FEED_CODE_PATTERN.test(code)) {
        errors.code = translate(FEED_TRANSLATION_IDS.VALIDATION_CODE_PATTERN);
    } else if (code.length > FEED_CODE_MAX_LENGTH) {
        errors.code = translate(FEED_TRANSLATION_IDS.VALIDATION_CODE_LENGTH, {
            count: FEED_CODE_MAX_LENGTH,
        });
    }
    if (!name) errors.name = translate(FEED_TRANSLATION_IDS.VALIDATION_NAME_REQUIRED);
    else if (name.length > FEED_NAME_MAX_LENGTH) {
        errors.name = translate(FEED_TRANSLATION_IDS.VALIDATION_NAME_LENGTH, {
            count: FEED_NAME_MAX_LENGTH,
        });
    }
    if (!values.format) errors.format = translate(FEED_TRANSLATION_IDS.VALIDATION_FORMAT_REQUIRED);
    if (values.format === DataHubFeedFormat.CUSTOM && !values.customGeneratorCode.trim()) {
        errors.customGeneratorCode = translate(FEED_TRANSLATION_IDS.VALIDATION_CUSTOM_GENERATOR);
    }

    errors.filters = validateFilters(values.filters, translate);
    errors.fieldMappings = validateJsonObject(values.fieldMappings, translate);
    errors.options = validateOptions(
        values.options,
        translate,
        values.format !== DataHubFeedFormat.CUSTOM,
    );

    if (values.scheduleEnabled) {
        if (!isValidCron(values.scheduleCron.trim())) {
            errors.scheduleCron = translate(FEED_TRANSLATION_IDS.VALIDATION_CRON);
        }
        const timezone = values.scheduleTimezone.trim();
        if (timezone && !isValidTimezone(timezone)) {
            errors.scheduleTimezone = translate(FEED_TRANSLATION_IDS.VALIDATION_TIMEZONE);
        }
    }
    return errors;
}

export function feedFormToInput(values: FeedFormValues): DataHubFeedInput {
    const customGeneratorCode = values.customGeneratorCode.trim();
    const timezone = values.scheduleTimezone.trim();
    return {
        code: values.code.trim(),
        name: values.name.trim(),
        format: values.format,
        customGeneratorCode: values.format === DataHubFeedFormat.CUSTOM
            ? customGeneratorCode
            : undefined,
        filters: parseJsonObject(values.filters),
        fieldMappings: parseJsonObject(values.fieldMappings),
        options: parseJsonObject(values.options),
        schedule: values.scheduleEnabled
            ? {
                enabled: true,
                cron: values.scheduleCron.trim(),
                timezone: timezone || undefined,
            }
            : undefined,
    };
}

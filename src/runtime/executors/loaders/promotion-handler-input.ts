import type {
    ConfigurableOperation,
    ConfigurableOperationInput,
    CreatePromotionInput,
    LanguageCode,
    PromotionTranslationInput,
    UpdatePromotionInput,
} from '@vendure/common/lib/generated-types';
import type { Promotion, RequestContext } from '@vendure/core';
import type {
    ActionsMode,
    ConditionsMode,
    PromotionUpsertLoaderConfig,
} from '../../../../shared/types';
import { LoadStrategy } from '../../../constants/enums';
import type { JsonObject } from '../../../types';
import { getNestedValue } from '../../../utils/object-path.utils';
import type { RecordObject } from '../../executor-types';
import type { CreateDuplicateHandlingConfig } from './duplicate-handling';
import {
    parsePromotionOperations,
    type ParsedPromotionOperations,
    requirePromotionActions,
} from './promotion-operation-input';
import { parseTranslationsInput } from './shared-lookups';
import {
    parseOptionalBoolean,
    parseUpsertStrategy,
} from './loader-config.validation';

export interface PromotionHandlerConfig extends CreateDuplicateHandlingConfig {
    codeField: string;
    enabledField: string;
    nameField: string;
    startsAtField: string;
    endsAtField: string;
    conditionsField?: string;
    conditionsMode: ConditionsMode;
    actionsField?: string;
    actionsMode: ActionsMode;
    channel?: string;
    customFieldsField: string;
    strategy?: LoadStrategy;
    translationsField?: string;
    channelsField?: string;
    descriptionField: string;
    perCustomerUsageLimitField?: string;
}

interface FieldValue {
    present: boolean;
    value: unknown;
}

const OPERATION_MODES = new Set<ConditionsMode | ActionsMode>([
    'REPLACE_ALL',
    'MERGE',
    'SKIP',
]);

export function getPromotionConfig(config: JsonObject): PromotionHandlerConfig {
    const source = config as Partial<PromotionUpsertLoaderConfig>;
    return {
        codeField: stringValue(source.codeField, 'code'),
        enabledField: stringValue(source.enabledField, 'enabled'),
        nameField: stringValue(source.nameField, 'name'),
        startsAtField: stringValue(source.startsAtField, 'startsAt'),
        endsAtField: stringValue(source.endsAtField, 'endsAt'),
        conditionsField: optionalString(source.conditionsField),
        conditionsMode: parseOperationMode(source.conditionsMode, 'conditions'),
        actionsField: optionalString(source.actionsField),
        actionsMode: parseOperationMode(source.actionsMode, 'actions'),
        channel: optionalString(source.channel),
        customFieldsField: stringValue(source.customFieldsField, 'customFields'),
        strategy: parseUpsertStrategy(source.strategy),
        skipDuplicates: parseOptionalBoolean(source.skipDuplicates, 'skipDuplicates'),
        translationsField: optionalString(source.translationsField),
        channelsField: optionalString(source.channelsField),
        descriptionField: stringValue(source.descriptionField, 'description'),
        perCustomerUsageLimitField: optionalString(source.perCustomerUsageLimitField),
    };
}

export function getPromotionCode(
    record: RecordObject,
    config: PromotionHandlerConfig,
): string {
    const value = readField(record, config.codeField).value;
    return value === undefined || value === null ? '' : String(value).trim();
}

export function getPromotionRecordValue(
    record: RecordObject,
    fieldName: string,
): unknown {
    return readField(record, fieldName).value;
}

export function buildCreatePromotionInput(
    ctx: RequestContext,
    record: RecordObject,
    config: PromotionHandlerConfig,
    code: string,
): CreatePromotionInput {
    const startsAt = parseDateField(record, config.startsAtField);
    const endsAt = parseDateField(record, config.endsAtField);
    validateDateRange(startsAt.value, endsAt.value);
    const conditions = parsePromotionOperations(
        record,
        config.conditionsField,
        'conditions',
    );
    const actions = parsePromotionOperations(record, config.actionsField, 'actions');
    const customFields = parseCustomFields(record, config.customFieldsField);

    return {
        enabled: parseBooleanField(record, config.enabledField) ?? true,
        startsAt: startsAt.value,
        endsAt: endsAt.value,
        couponCode: code,
        conditions: conditions.operations ?? [],
        actions: requirePromotionActions(actions),
        translations: buildTranslations(ctx, record, config, code, '', true) ?? [],
        ...(customFields.present ? { customFields: customFields.value } : {}),
        ...buildUsageLimit(record, config),
    };
}

export function buildUpdatePromotionInput(
    ctx: RequestContext,
    record: RecordObject,
    config: PromotionHandlerConfig,
    existing: Promotion,
): UpdatePromotionInput {
    const startsAt = parseDateField(record, config.startsAtField);
    const endsAt = parseDateField(record, config.endsAtField);
    validateDateRange(
        startsAt.present ? startsAt.value : existing.startsAt,
        endsAt.present ? endsAt.value : existing.endsAt,
    );
    const conditions = config.conditionsMode === 'SKIP'
        ? { present: false }
        : parsePromotionOperations(record, config.conditionsField, 'conditions');
    const actions = config.actionsMode === 'SKIP'
        ? { present: false }
        : parsePromotionOperations(record, config.actionsField, 'actions');
    const customFields = parseCustomFields(record, config.customFieldsField);
    const enabled = parseBooleanField(record, config.enabledField);
    const translations = buildTranslations(
        ctx,
        record,
        config,
        existing.name || existing.couponCode,
        existing.description || '',
        false,
    );

    return {
        id: existing.id,
        couponCode: existing.couponCode,
        ...(enabled !== undefined ? { enabled } : {}),
        ...(startsAt.present ? { startsAt: startsAt.value } : {}),
        ...(endsAt.present ? { endsAt: endsAt.value } : {}),
        ...(translations ? { translations } : {}),
        ...(customFields.present ? { customFields: customFields.value } : {}),
        ...buildUsageLimit(record, config),
        ...operationUpdate('conditions', existing.conditions, conditions, config.conditionsMode),
        ...operationUpdate('actions', existing.actions, actions, config.actionsMode),
    };
}

function operationUpdate(
    field: 'conditions' | 'actions',
    existing: ConfigurableOperation[],
    parsed: ParsedPromotionOperations,
    mode: ConditionsMode | ActionsMode,
): Partial<Pick<UpdatePromotionInput, 'conditions' | 'actions'>> {
    if (!parsed.present || mode === 'SKIP') {
        return {};
    }
    const incoming = parsed.operations ?? [];
    const operations = mode === 'MERGE'
        ? mergeOperations(existing, incoming)
        : incoming;
    if (field === 'actions') {
        return { actions: requirePromotionActions({ present: true, operations }) };
    }
    return { conditions: operations };
}

export function mergeOperations(
    existing: ConfigurableOperation[],
    incoming: ConfigurableOperationInput[],
): ConfigurableOperationInput[] {
    const merged = [
        ...existing.map(toOperationInput),
        ...incoming,
    ];
    return [...new Map(merged.map(operation => [operationKey(operation), operation])).values()];
}

function toOperationInput(operation: ConfigurableOperation): ConfigurableOperationInput {
    return {
        code: operation.code,
        arguments: operation.args.map(argument => ({
            name: argument.name,
            value: argument.value,
        })),
    };
}

function operationKey(operation: ConfigurableOperationInput): string {
    const args = [...operation.arguments]
        .map(argument => [argument.name, argument.value] as const)
        .sort(([left], [right]) => left.localeCompare(right));
    return JSON.stringify([operation.code, args]);
}

function buildTranslations(
    ctx: RequestContext,
    record: RecordObject,
    config: PromotionHandlerConfig,
    fallbackName: string,
    fallbackDescription: string,
    required: boolean,
): PromotionTranslationInput[] | undefined {
    const translationField = config.translationsField
        ? readField(record, config.translationsField)
        : { present: false, value: undefined };
    const nameField = readField(record, config.nameField);
    const descriptionField = readField(record, config.descriptionField);
    const name = nameField.present && nameField.value != null
        ? String(nameField.value)
        : fallbackName;
    const description = descriptionField.present
        ? String(descriptionField.value ?? '')
        : fallbackDescription;

    if (translationField.present) {
        const parsed = parseTranslationsInput(translationField.value);
        if (parsed.length === 0) {
            throw new Error('Promotion translations must contain at least one language entry');
        }
        return parsed.map(translation => ({
            languageCode: String(translation.languageCode) as LanguageCode,
            name: String(translation.name ?? name),
            description: String(translation.description ?? ''),
        }));
    }
    if (!required && !nameField.present && !descriptionField.present) {
        return undefined;
    }
    return [{
        languageCode: ctx.languageCode as LanguageCode,
        name,
        description,
    }];
}

function parseBooleanField(record: RecordObject, fieldName: string): boolean | undefined {
    const field = readField(record, fieldName);
    if (!field.present) {
        return undefined;
    }
    if (typeof field.value === 'boolean') {
        return field.value;
    }
    if (field.value === 1 || field.value === '1' || field.value === 'true') {
        return true;
    }
    if (field.value === 0 || field.value === '0' || field.value === 'false') {
        return false;
    }
    throw new Error(`Promotion enabled field "${fieldName}" must be a boolean`);
}

function parseDateField(record: RecordObject, fieldName: string): FieldValue {
    const field = readField(record, fieldName);
    if (!field.present || field.value === null) {
        return field;
    }
    if (!(field.value instanceof Date)
        && typeof field.value !== 'string'
        && typeof field.value !== 'number') {
        throw new Error(`Promotion date field "${fieldName}" must be an ISO date or null`);
    }
    const date = field.value instanceof Date ? field.value : new Date(field.value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Promotion date field "${fieldName}" is invalid`);
    }
    return { present: true, value: date };
}

function validateDateRange(startsAt: unknown, endsAt: unknown): void {
    if (startsAt instanceof Date && endsAt instanceof Date && startsAt >= endsAt) {
        throw new Error('Promotion end date must be after start date');
    }
}

function buildUsageLimit(
    record: RecordObject,
    config: PromotionHandlerConfig,
): Pick<UpdatePromotionInput, 'perCustomerUsageLimit'> {
    if (!config.perCustomerUsageLimitField) {
        return {};
    }
    const field = readField(record, config.perCustomerUsageLimitField);
    if (!field.present) {
        return {};
    }
    if (field.value === null) {
        throw new Error('Promotion per-customer usage limit must be a non-negative integer');
    }
    const value = Number(field.value);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error('Promotion per-customer usage limit must be a non-negative integer');
    }
    return { perCustomerUsageLimit: value };
}

function parseCustomFields(record: RecordObject, fieldName: string): FieldValue {
    const field = readField(record, fieldName);
    if (!field.present || field.value === null) {
        return field;
    }
    if (typeof field.value !== 'object' || Array.isArray(field.value)) {
        throw new Error(`Promotion custom fields "${fieldName}" must be an object or null`);
    }
    return field;
}

function readField(record: RecordObject, fieldName: string): FieldValue {
    const value = fieldName.includes('.')
        ? getNestedValue(record, fieldName)
        : record[fieldName];
    return { present: value !== undefined, value };
}

function stringValue(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function parseOperationMode<T extends ConditionsMode | ActionsMode>(
    value: T | undefined,
    field: 'conditions' | 'actions',
): T {
    const mode = value ?? 'REPLACE_ALL';
    if (!OPERATION_MODES.has(mode)) {
        throw new Error(`Unsupported promotion ${field} mode "${String(mode)}"`);
    }
    return mode as T;
}

import type {
    ConfigOptionValue,
    ConnectionSchemaField,
    TypedOptionValue,
} from '../hooks/api/use-config-options';
import { getNestedValue, setNestedValue } from '../../shared/utils/object-path';

export type TriggerOptionSources = object;

const AUTH_FIELD_MODES: Readonly<Record<string, readonly string[]>> = {
    secretCode: ['HMAC'],
    hmacHeaderName: ['HMAC'],
    hmacAlgorithm: ['HMAC'],
    apiKeySecretCode: ['API_KEY'],
    apiKeyHeaderName: ['API_KEY'],
    apiKeyPrefix: ['API_KEY'],
    basicSecretCode: ['BASIC'],
    jwtSecretCode: ['JWT'],
    jwtHeaderName: ['JWT'],
    jwtIssuer: ['JWT'],
    jwtAudience: ['JWT'],
};

export function resolveTriggerFieldOptions(
    field: ConnectionSchemaField,
    optionSources?: TriggerOptionSources,
): ConfigOptionValue[] {
    if (field.options?.length) {
        return field.options.map(option => ({ ...option }));
    }
    if (!field.optionsRef) {
        return [];
    }
    const options = optionSources
        ? Reflect.get(optionSources, field.optionsRef) as unknown
        : undefined;
    return Array.isArray(options)
        ? (options as ConfigOptionValue[]).filter(option => option.value !== '')
        : [];
}

export function isTriggerSchemaFieldVisible(
    field: ConnectionSchemaField,
    values: Record<string, unknown>,
): boolean {
    const modes = AUTH_FIELD_MODES[field.key];
    if (!modes) {
        return true;
    }
    const authentication = String(values.authentication ?? 'HMAC');
    return modes.includes(authentication);
}

export function applyTriggerSchemaDefaults<T extends Record<string, unknown>>(
    current: T,
    type: string,
    schema: TypedOptionValue | undefined,
): T {
    let next: Record<string, unknown> = { ...current, type };
    const defaults = schema?.defaultValues ?? {};

    for (const [key, value] of Object.entries(defaults)) {
        if (getNestedValue(next, key) === undefined) {
            next = setNestedValue(next, key, value);
        }
    }
    for (const field of schema?.fields ?? []) {
        if (field.defaultValue !== undefined && getNestedValue(next, field.key) === undefined) {
            next = setNestedValue(next, field.key, field.defaultValue);
        }
    }
    return next as T;
}

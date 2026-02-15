import type { AdapterSchemaField, SelectOption } from '../../shared/types';

interface PrepareDynamicFieldsOptions {
    baseFields: AdapterSchemaField[];
    connectionCodes?: string[];
    secretCodes?: string[];
}

export function prepareDynamicFields(options: PrepareDynamicFieldsOptions): AdapterSchemaField[] {
    const { baseFields, connectionCodes = [], secretCodes = [] } = options;

    return baseFields.map((field) => {
        if (field.key === 'connectionCode') {
            const options: SelectOption[] = connectionCodes.map((code) => ({
                value: code,
                label: code,
            }));
            return { ...field, type: 'SELECT' as const, options };
        }

        if (field.key.endsWith('SecretCode')) {
            const options: SelectOption[] = secretCodes.map((code) => ({
                value: code,
                label: code,
            }));
            return { ...field, type: 'SECRET' as const, options };
        }

        return field;
    });
}

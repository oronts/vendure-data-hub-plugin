import type { EnhancedFieldDefinition } from '../types/index';

export function id(label: string = 'ID'): EnhancedFieldDefinition {
    return { type: 'string', required: true, label, description: 'Unique identifier' };
}

export function timestamps(): Record<string, EnhancedFieldDefinition> {
    return {
        createdAt: { type: 'datetime', label: 'Created At', readonly: true },
        updatedAt: { type: 'datetime', label: 'Updated At', readonly: true },
    };
}

export function money(label: string): EnhancedFieldDefinition {
    return {
        type: 'integer',
        label,
        description: 'Amount in minor units (cents)',
        validation: { min: 0 },
    };
}

export function currencyCode(): EnhancedFieldDefinition {
    return {
        type: 'currency',
        label: 'Currency',
        default: 'USD',
    };
}

const DELETION_MATCHES = {
    product: ['slug', 'sku', 'id'],
    variant: ['sku', 'id'],
    collection: ['slug', 'id'],
    promotion: ['code', 'id'],
    'shipping-method': ['code', 'id'],
    customer: ['email', 'id'],
    'payment-method': ['code', 'id'],
    facet: ['code', 'id'],
    'facet-value': ['code', 'id'],
    'customer-group': ['name', 'id'],
    'tax-rate': ['name', 'id'],
    asset: ['name', 'id'],
    'stock-location': ['name', 'id'],
} as const;

export type DeletionEntityType = keyof typeof DELETION_MATCHES;
export type DeletionMatchBy = typeof DELETION_MATCHES[DeletionEntityType][number];

export interface DeletionHandlerConfig {
    entityType: DeletionEntityType;
    identifierField: string;
    matchBy: DeletionMatchBy;
    channel?: string;
}

function optionalNonBlankString(value: unknown, field: string): string | undefined {
    if (value == null) return undefined;
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Entity deletion ${field} must be a non-empty string`);
    }
    return value.trim();
}

export function parseDeletionHandlerConfig(
    config: Record<string, unknown>,
): DeletionHandlerConfig {
    const entityType = config.entityType ?? 'product';
    if (typeof entityType !== 'string' || !(entityType in DELETION_MATCHES)) {
        throw new Error(`Unsupported entity type for deletion: ${String(entityType)}`);
    }
    const typedEntity = entityType as DeletionEntityType;
    const matchBy = config.matchBy ?? DELETION_MATCHES[typedEntity][0];
    if (
        typeof matchBy !== 'string'
        || !(DELETION_MATCHES[typedEntity] as readonly string[]).includes(matchBy)
    ) {
        throw new Error(`Unsupported matchBy "${String(matchBy)}" for ${typedEntity} deletion`);
    }
    return {
        entityType: typedEntity,
        matchBy: matchBy as DeletionMatchBy,
        identifierField: optionalNonBlankString(config.identifierField, 'identifierField')
            ?? matchBy,
        channel: optionalNonBlankString(config.channel, 'channel'),
    };
}

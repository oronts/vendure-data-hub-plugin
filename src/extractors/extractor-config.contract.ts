const FLAT_NESTED_FIELD_PREFIXES = ['pagination.', 'retry.', 'rateLimit.'] as const;
const HTTP_PAGINATION_TYPES = new Set(['NONE', 'OFFSET', 'CURSOR', 'PAGE', 'LINK_HEADER']);
const GRAPHQL_PAGINATION_TYPES = new Set(['NONE', 'OFFSET', 'CURSOR', 'RELAY']);

export const HTTP_EXTRACTOR_LEGACY_FIELDS = [
    'itemsField',
    'paginationType',
    'pageParam',
    'pageSize',
    'offsetParam',
    'limitParam',
    'cursorParam',
    'cursorField',
    'nextPageField',
    'cursorPath',
    'maxPages',
    'retries',
    'retryDelayMs',
    'maxRetryDelayMs',
    'backoffMultiplier',
    'bearerTokenSecretCode',
    'basicSecretCode',
    'hmacHeader',
    'hmacSecretCode',
    'hmacPayloadTemplate',
] as const;

export const GRAPHQL_EXTRACTOR_LEGACY_FIELDS = [
    'endpoint',
    'itemsField',
    'edgesField',
    'nodeField',
    'cursorVar',
    'nextCursorField',
    'pageInfoField',
    'hasNextPageField',
    'endCursorField',
    'paginationType',
    'offsetVariable',
    'limitVariable',
    'pageSize',
    'bearerTokenSecretCode',
    'basicSecretCode',
] as const;

function findFlatNestedField(config: Record<string, unknown>): string | undefined {
    return Object.keys(config).find(key => (
        FLAT_NESTED_FIELD_PREFIXES.some(prefix => key.startsWith(prefix))
    ));
}

export function findLegacyExtractorField(
    adapterCode: 'httpApi' | 'graphql',
    config: Record<string, unknown>,
): string | undefined {
    const aliases = adapterCode === 'httpApi'
        ? HTTP_EXTRACTOR_LEGACY_FIELDS
        : GRAPHQL_EXTRACTOR_LEGACY_FIELDS;
    return aliases.find(key => Object.prototype.hasOwnProperty.call(config, key))
        ?? findFlatNestedField(config);
}

export function assertCanonicalExtractorConfig(
    adapterCode: 'httpApi' | 'graphql',
    config: Record<string, unknown>,
): void {
    const field = findLegacyExtractorField(adapterCode, config);
    if (field) {
        throw new Error(
            `Extractor "${adapterCode}" uses unsupported legacy field "${field}"; use the canonical nested schema`,
        );
    }

    const pagination = config.pagination;
    if (pagination === undefined) return;
    if (pagination === null || typeof pagination !== 'object' || Array.isArray(pagination)) {
        throw new Error(`Extractor "${adapterCode}" pagination must be an object`);
    }

    const type = (pagination as Record<string, unknown>).type;
    const allowedTypes = adapterCode === 'httpApi'
        ? HTTP_PAGINATION_TYPES
        : GRAPHQL_PAGINATION_TYPES;
    if (type !== undefined && (typeof type !== 'string' || !allowedTypes.has(type))) {
        throw new Error(
            `Extractor "${adapterCode}" uses invalid pagination type "${String(type)}"`,
        );
    }
}

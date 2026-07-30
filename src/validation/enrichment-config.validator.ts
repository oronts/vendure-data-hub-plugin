import { ENRICHMENT_SOURCE_TYPES } from '../constants/adapter-schema-options';

export type EnrichmentSourceType = 'STATIC' | 'HTTP' | 'VENDURE';

export interface EnrichmentConfigIssue {
    readonly field: string;
    readonly message: string;
    readonly errorCode: string;
}

export interface EnrichmentConfigValidationResult {
    readonly sourceType?: EnrichmentSourceType;
    readonly issues: EnrichmentConfigIssue[];
}

const SUPPORTED_SOURCE_TYPES = new Set(
    ENRICHMENT_SOURCE_TYPES.map(option => option.value),
);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasEntries(value: unknown): boolean {
    return isRecord(value) && Object.keys(value).length > 0;
}

function requiredStringIssue(
    config: Record<string, unknown>,
    field: string,
): EnrichmentConfigIssue | undefined {
    const value = config[field];
    if (typeof value === 'string' && value.trim().length > 0) return undefined;
    return {
        field,
        message: `${field} must be a non-empty string`,
        errorCode: 'missing-enrichment-field',
    };
}

function validateMutationMap(
    config: Record<string, unknown>,
    field: 'defaults' | 'set',
    issues: EnrichmentConfigIssue[],
): void {
    const value = config[field];
    if (value === undefined || isRecord(value)) return;
    issues.push({
        field,
        message: `${field} must be an object`,
        errorCode: 'invalid-enrichment-field',
    });
}

function validateComputed(
    config: Record<string, unknown>,
    issues: EnrichmentConfigIssue[],
): void {
    const value = config.computed;
    if (value === undefined) return;
    if (!isRecord(value)) {
        issues.push({
            field: 'computed',
            message: 'computed must be an object of string templates',
            errorCode: 'invalid-enrichment-field',
        });
        return;
    }
    for (const [key, template] of Object.entries(value)) {
        if (typeof template !== 'string') {
            issues.push({
                field: `computed.${key}`,
                message: `computed.${key} must be a string template`,
                errorCode: 'invalid-enrichment-field',
            });
        }
    }
}

export function validateEnrichmentConfig(
    config: Record<string, unknown>,
): EnrichmentConfigValidationResult {
    const issues: EnrichmentConfigIssue[] = [];
    const rawSourceType = config.sourceType;
    const hasStaticConfig = config.defaults !== undefined
        || config.set !== undefined
        || config.computed !== undefined;
    let sourceType: EnrichmentSourceType | undefined;

    if (rawSourceType === undefined && hasStaticConfig) {
        sourceType = 'STATIC';
    } else if (
        typeof rawSourceType === 'string'
        && SUPPORTED_SOURCE_TYPES.has(rawSourceType)
    ) {
        sourceType = rawSourceType as EnrichmentSourceType;
    } else {
        issues.push({
            field: 'sourceType',
            message: `sourceType must be one of ${Array.from(SUPPORTED_SOURCE_TYPES).join(', ')}`,
            errorCode: 'invalid-enrichment-source-type',
        });
        return { issues };
    }

    if (sourceType === 'STATIC') {
        validateMutationMap(config, 'defaults', issues);
        validateMutationMap(config, 'set', issues);
        validateComputed(config, issues);
        if (!hasEntries(config.defaults) && !hasEntries(config.set) && !hasEntries(config.computed)) {
            issues.push({
                field: 'sourceType',
                message: 'STATIC enrichment requires a non-empty defaults, set, or computed object',
                errorCode: 'missing-enrichment-config',
            });
        }
    }

    if (sourceType === 'HTTP') {
        const issue = requiredStringIssue(config, 'url');
        if (issue) issues.push(issue);
    }

    if (sourceType === 'VENDURE') {
        for (const field of ['entityType', 'sourceField', 'lookupField'] as const) {
            const issue = requiredStringIssue(config, field);
            if (issue) issues.push(issue);
        }
    }

    return { sourceType, issues };
}

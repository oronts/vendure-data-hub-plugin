import type { PipelineDefinition, PipelineStepDefinition, PipelineEdge, OperatorConfig } from '../../shared/types';
import type { ImportSourceConfig, DestinationConfig } from '../types/wizard';
import type { ImportConfiguration } from '../components/wizards/import-wizard/types';
import type { ExportConfiguration } from '../components/wizards/export-wizard/types';
import { DEFAULT_CHANNEL_CODE } from '../../shared/constants';
import type { DestinationSchema, TypedOptionValue, WizardStrategyMapping } from '../hooks/api/use-config-options';

/** Minimal adapter info shape for loader field mapping resolution. */
export interface LoaderAdapterInfo {
    code: string;
    entityType?: string | null;
    schema?: { fields?: Array<{ key: string }> };
}

/**
 * Generate a URL-safe pipeline code from a name.
 * Example: "My Product Import" -> "my-product-import"
 */
export function generatePipelineCode(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'untitled-pipeline';
}

// --- AdapterResolver: dynamic adapter code resolution ---

/**
 * Resolves adapter codes dynamically using backend adapter metadata.
 * When adapter data is unavailable, falls back to convention-based defaults.
 */
export interface AdapterResolver {
    getLoaderAdapterCode(entityType: string): string | undefined;
    getExportAdapterCode(formatType: string): string | undefined;
    getFeedAdapterCode(formatType: string): string | undefined;
}

// --- Dynamic resolution with convention-based fallbacks ---

/**
 * Resolve loader adapter code from entity type.
 * Searches backend loader adapters by entityType metadata first,
 * then falls back to convention: kebab-to-camelCase + 'Upsert'.
 */
function resolveLoaderCode(entityType: string, loaders?: Array<{ code: string; entityType?: string | null }>): string {
    if (loaders?.length) {
        const loader = loaders.find(l => l.entityType === entityType);
        if (loader) return loader.code;
    }
    // Convention fallback: 'product' -> 'productUpsert', 'product-variant' -> 'productVariantUpsert'
    return `${entityType.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}Upsert`;
}

/**
 * Resolve export adapter code from format type.
 * Searches backend exporter adapters by formatType metadata first,
 * then falls back to convention: lowercase format + 'Export'.
 */
function resolveExporterCode(formatType: string, exporters?: Array<{ code: string; formatType?: string | null }>): string {
    if (exporters?.length) {
        const exporter = exporters.find(e => e.formatType === formatType);
        if (exporter) return exporter.code;
    }
    // Convention fallback: 'CSV' -> 'csvExport'
    return `${formatType.toLowerCase()}Export`;
}

/**
 * Resolve field mappings for a loader from its schema metadata.
 * Derives which record fields map to loader config fields by reading the
 * adapter's schema. Excludes meta/config fields that are not record data.
 */
function resolveFieldMappings(
    loaderCode: string,
    loaders?: Array<{ code: string; schema?: { fields?: Array<{ key: string }> } }>,
): Record<string, string> {
    if (!loaders?.length) return {};
    const loader = loaders.find(l => l.code === loaderCode);
    if (!loader?.schema?.fields) return {};

    // Exclude meta/config fields - these are not record data fields
    const META_FIELDS = new Set(['strategy', 'conflictStrategy', 'channel', 'lookupFields', 'connectionCode']);

    return Object.fromEntries(
        loader.schema.fields
            .filter(f => !META_FIELDS.has(f.key))
            .map(f => [f.key, f.key])
    );
}

/**
 * Default resolver using convention-based fallbacks (no adapter data).
 * Used when no backend adapter data is available.
 */
const defaultResolver: AdapterResolver = {
    getLoaderAdapterCode: (entityType) => resolveLoaderCode(entityType),
    getExportAdapterCode: (formatType) => resolveExporterCode(formatType),
    getFeedAdapterCode: () => undefined,
};

/** Fallback strategy maps used when backend mappings are not available */
const FALLBACK_STRATEGY_MAPPINGS: WizardStrategyMapping[] = [
    { wizardValue: 'SKIP', label: 'Skip existing', loadStrategy: 'CREATE', conflictStrategy: 'SOURCE_WINS' },
    { wizardValue: 'UPDATE', label: 'Update existing', loadStrategy: 'UPSERT', conflictStrategy: 'MERGE' },
    { wizardValue: 'REPLACE', label: 'Replace existing', loadStrategy: 'UPSERT', conflictStrategy: 'SOURCE_WINS' },
    { wizardValue: 'ERROR', label: 'Error on existing', loadStrategy: 'CREATE', conflictStrategy: 'SOURCE_WINS' },
];

/** Resolve load strategy and conflict strategy from wizard value using backend mappings */
function resolveStrategyMapping(
    wizardValue: string,
    mappings?: WizardStrategyMapping[],
): { loadStrategy: string; conflictStrategy: string } {
    const source = mappings?.length ? mappings : FALLBACK_STRATEGY_MAPPINGS;
    const mapping = source.find(m => m.wizardValue === wizardValue);
    return {
        loadStrategy: mapping?.loadStrategy ?? 'UPSERT',
        conflictStrategy: mapping?.conflictStrategy ?? 'SOURCE_WINS',
    };
}

// --- Helper: build linear edges ---

function buildLinearEdges(stepKeys: string[]): PipelineEdge[] {
    const edges: PipelineEdge[] = [];
    for (let i = 0; i < stepKeys.length - 1; i++) {
        edges.push({ from: stepKeys[i], to: stepKeys[i + 1] });
    }
    return edges;
}

// --- Shared trigger builder ---

function buildTriggerConfig(
    trigger: { type: string; [key: string]: unknown },
    triggerSchemas?: TypedOptionValue[],
): Record<string, unknown> {
    const config: Record<string, unknown> = { type: trigger.type };

    // Schema-driven config building
    if (triggerSchemas?.length) {
        const schema = triggerSchemas.find(s => s.value === trigger.type);
        if (schema) {
            for (const field of schema.fields) {
                const value = trigger[field.key];
                if (value !== undefined && value !== null && value !== '') {
                    // Apply configKeyMap if defined (e.g. schedule -> cron)
                    const configKey = schema.configKeyMap?.[field.key] ?? field.key;
                    config[configKey] = value;
                }
            }
            return config;
        }
    }

    // Convention-based fallback when trigger schemas are unavailable (intentional design)
    if (trigger.type === 'SCHEDULE' && trigger.schedule) {
        config.cron = trigger.schedule;
    }
    if (trigger.type === 'WEBHOOK' && trigger.webhookPath) {
        config.path = trigger.webhookPath;
    }
    if (trigger.type === 'FILE' && trigger.fileWatchPath) {
        config.fileWatchPath = trigger.fileWatchPath;
    }
    if (trigger.type === 'EVENT' && trigger.events) {
        config.events = trigger.events;
    }
    return config;
}

// --- Import conversion ---

function buildImportTriggerStep(config: ImportConfiguration, triggerSchemas?: TypedOptionValue[]): PipelineStepDefinition {
    return {
        key: 'trigger',
        type: 'TRIGGER',
        config: buildTriggerConfig(config.trigger, triggerSchemas),
    };
}

// --- Source config builders: registry mapping wizard source types to extract step configs ---

interface ExtractResult {
    adapterCode: string;
    config: Record<string, unknown>;
}

type SourceConfigBuilder = (source: ImportSourceConfig) => ExtractResult;

/**
 * Formats where the extractor adapter code differs from format.toLowerCase().
 * XLSX is parsed client-side into JSON records, so it uses the json extractor.
 */
const FORMAT_EXTRACTOR_OVERRIDES: Record<string, string> = {
    XLSX: 'json',
};

/**
 * Maps wizard FileSourceConfig field names to extractor config field names
 * where they differ. Unmapped fields pass through with the same key.
 */
const FILE_CONFIG_KEY_MAP: Record<string, string> = {
    hasHeaders: 'hasHeader',
};

/**
 * Resolve extractor adapter code + config from a file format.
 * Convention: format.toLowerCase() matches the adapter code (csv, json, xml).
 * File config fields (delimiter, encoding, hasHeaders) pass through to the
 * extractor config generically, with field name remapping where needed.
 */
function resolveFileFormatExtractor(
    format: string,
    file: NonNullable<ImportSourceConfig['fileConfig']>,
): ExtractResult {
    const adapterCode = FORMAT_EXTRACTOR_OVERRIDES[format] ?? format.toLowerCase();

    // Pass through all file config fields except 'format' and 'sheetName' (wizard-only)
    const config: Record<string, unknown> = {};
    const WIZARD_ONLY_KEYS = new Set(['format', 'sheetName']);
    for (const [key, value] of Object.entries(file)) {
        if (WIZARD_ONLY_KEYS.has(key) || value === undefined || value === null || value === '') continue;
        const configKey = FILE_CONFIG_KEY_MAP[key] ?? key;
        config[configKey] = value;
    }

    return { adapterCode, config };
}

const SOURCE_CONFIG_BUILDERS: Record<string, SourceConfigBuilder> = {
    FILE: (source) => {
        const file = source.fileConfig;
        if (!file) return { adapterCode: 'csv', config: {} };
        return resolveFileFormatExtractor(file.format, file);
    },
    API: (source) => {
        const apiCfg = source.apiConfig;
        return {
            adapterCode: 'httpApi',
            config: apiCfg
                ? { url: apiCfg.url, method: apiCfg.method, headers: apiCfg.headers, body: apiCfg.body, pagination: apiCfg.pagination }
                : {},
        };
    },
};

function buildImportExtractStep(config: ImportConfiguration): PipelineStepDefinition {
    const source = config.source;
    const builder = SOURCE_CONFIG_BUILDERS[source.type];

    let adapterCode: string;
    let extractConfig: Record<string, unknown>;

    if (builder) {
        const result = builder(source);
        adapterCode = result.adapterCode;
        extractConfig = result.config;
    } else {
        // Dynamic source type -- adapter code is lowercase of source type
        adapterCode = source.type.toLowerCase();
        const dynamicConfigKey = `${source.type.toLowerCase()}Config`;
        const dynamicConfig = (source as Record<string, unknown>)[dynamicConfigKey];
        extractConfig = dynamicConfig && typeof dynamicConfig === 'object'
            ? { ...(dynamicConfig as Record<string, unknown>) }
            : {};
    }

    return {
        key: 'extract',
        type: 'EXTRACT',
        config: { adapterCode, ...extractConfig },
    };
}

function buildImportTransformStep(config: ImportConfiguration): PipelineStepDefinition {
    const operators: OperatorConfig[] = [];

    // Build rename operators from field mappings (only when source !== target)
    for (const mapping of config.mappings) {
        if (mapping.sourceField !== mapping.targetField) {
            operators.push({
                op: 'rename',
                args: { from: mapping.sourceField, to: mapping.targetField },
            });
        }
    }

    // Build defaults operators for mappings with default values
    for (const mapping of config.mappings) {
        if (mapping.defaultValue !== undefined && mapping.defaultValue !== null && mapping.defaultValue !== '') {
            operators.push({
                op: 'defaults',
                args: { [mapping.targetField]: mapping.defaultValue },
            });
        }
    }

    // Append user-defined transformations
    for (const transform of config.transformations) {
        if (transform.enabled !== false) {
            operators.push({
                op: transform.type,
                args: transform.config,
            });
        }
    }

    return {
        key: 'transform',
        type: 'TRANSFORM',
        config: { operators },
    };
}

function buildImportLoadStep(
    config: ImportConfiguration,
    resolver: AdapterResolver,
    loaderAdapters?: LoaderAdapterInfo[],
    strategyMappings?: WizardStrategyMapping[],
): PipelineStepDefinition {
    const adapterCode = resolver.getLoaderAdapterCode(config.targetEntity) ?? resolveLoaderCode(config.targetEntity);
    const { loadStrategy, conflictStrategy } = resolveStrategyMapping(config.strategies.existingRecords, strategyMappings);

    // Auto-derive entity-specific field mappings from backend adapter schemas.
    // After the transform step renames source -> target, the loader reads from target field names.
    const schemaFieldMap = resolveFieldMappings(adapterCode, loaderAdapters);
    const fieldConfig: Record<string, string> = {};
    if (Object.keys(schemaFieldMap).length > 0) {
        for (const mapping of config.mappings) {
            if (mapping.targetField && schemaFieldMap[mapping.targetField]) {
                fieldConfig[schemaFieldMap[mapping.targetField]] = mapping.targetField;
            }
        }
    }

    return {
        key: 'load',
        type: 'LOAD',
        config: {
            adapterCode,
            strategy: loadStrategy,
            channel: DEFAULT_CHANNEL_CODE,
            conflictStrategy: conflictStrategy,
            lookupFields: config.strategies.lookupFields,
            batchSize: config.strategies.batchSize,
            continueOnError: config.strategies.continueOnError,
            errorThreshold: config.strategies.errorThreshold,
            ...fieldConfig,
        },
    };
}

/**
 * Convert an import wizard configuration into a PipelineDefinition.
 * Accepts an optional AdapterResolver for dynamic adapter code lookups,
 * optional loader adapter metadata for field mapping resolution,
 * optional trigger type schemas for schema-driven trigger config building,
 * and optional strategy mappings for wizard-to-backend strategy resolution.
 * Falls back to convention-based defaults when adapter data is not provided.
 */
export function importConfigToPipelineDefinition(
    config: ImportConfiguration,
    resolver: AdapterResolver = defaultResolver,
    loaderAdapters?: LoaderAdapterInfo[],
    triggerSchemas?: TypedOptionValue[],
    strategyMappings?: WizardStrategyMapping[],
): PipelineDefinition {
    const trigger = buildImportTriggerStep(config, triggerSchemas);
    const extract = buildImportExtractStep(config);
    const transform = buildImportTransformStep(config);
    const load = buildImportLoadStep(config, resolver, loaderAdapters, strategyMappings);

    const steps = [trigger, extract, transform, load];
    const edges = buildLinearEdges(steps.map(s => s.key));

    return {
        version: 1,
        name: config.name,
        description: config.description,
        steps,
        edges,
    };
}

// --- Export conversion ---

function buildExportTriggerStep(config: ExportConfiguration, triggerSchemas?: TypedOptionValue[]): PipelineStepDefinition {
    return {
        key: 'trigger',
        type: 'TRIGGER',
        config: buildTriggerConfig(config.trigger, triggerSchemas),
    };
}

function buildExportExtractStep(config: ExportConfiguration): PipelineStepDefinition {
    const extractConfig: Record<string, unknown> = {
        entity: config.sourceEntity,
        batchSize: config.options.batchSize,
    };

    if (config.sourceQuery?.customQuery) {
        extractConfig.customQuery = config.sourceQuery.customQuery;
    }

    return {
        key: 'extract',
        type: 'EXTRACT',
        config: { adapterCode: 'vendureQuery', ...extractConfig },
    };
}

function buildExportTransformStep(config: ExportConfiguration): PipelineStepDefinition {
    const operators: OperatorConfig[] = [];

    // Pick only included fields
    const includedFields = config.fields.filter(f => f.include);
    if (includedFields.length > 0) {
        operators.push({
            op: 'pick',
            args: { fields: includedFields.map(f => f.sourceField) },
        });
    }

    // Rename fields where outputName differs from sourceField
    for (const field of includedFields) {
        if (field.outputName !== field.sourceField) {
            operators.push({
                op: 'rename',
                args: { from: field.sourceField, to: field.outputName },
            });
        }
    }

    return {
        key: 'transform',
        type: 'TRANSFORM',
        config: { operators },
    };
}

function buildExportOutputStep(
    config: ExportConfiguration,
    resolver: AdapterResolver,
    destinationSchemas?: DestinationSchema[],
): PipelineStepDefinition {
    const formatType = config.format.type;
    const formatOptions = config.format.options;
    const destinationConfig = buildDestinationConfig(config.destination, destinationSchemas);

    // Feed formats
    const feedAdapter = resolver.getFeedAdapterCode(formatType);
    if (feedAdapter) {
        return {
            key: 'feed',
            type: 'FEED',
            config: {
                adapterCode: feedAdapter,
                ...formatOptions,
                ...destinationConfig,
            },
        };
    }

    // Standard export formats
    const exportAdapter = resolver.getExportAdapterCode(formatType) ?? 'csvExport';

    return {
        key: 'export',
        type: 'EXPORT',
        config: {
            adapterCode: exportAdapter,
            ...formatOptions,
            ...destinationConfig,
        },
    };
}

// --- Destination config builder ---

/** Fallback field mapping for FILE destinations, used when backend schema data is unavailable. */
const FALLBACK_FILE_FIELD_MAPPING: Record<string, string> = { directory: 'path', filename: 'filenamePattern' };

/**
 * Build destination config for the pipeline step from wizard state.
 *
 * Uses backend destination schema metadata when available:
 * - Empty configKey (e.g. DOWNLOAD) -> no additional config beyond destinationType.
 * - Non-empty fieldMapping -> renames wizard fields to pipeline config field names.
 * - Otherwise -> spreads the wizard sub-object (`${configKey}`) verbatim.
 *
 * Falls back to convention-based logic when destination schemas are not provided.
 */
function buildDestinationConfig(
    destination: DestinationConfig,
    destinationSchemas?: DestinationSchema[],
): Record<string, unknown> {
    const result: Record<string, unknown> = {
        destinationType: destination.type,
    };

    const schema = destinationSchemas?.find(s => s.type === destination.type);

    // Schema-driven path
    if (schema) {
        // No configKey means no additional config (e.g. DOWNLOAD)
        if (!schema.configKey) return result;

        const subConfig = (destination as Record<string, unknown>)[schema.configKey];
        if (!subConfig || typeof subConfig !== 'object') return result;

        const sourceObj = subConfig as Record<string, unknown>;
        const fieldMapping = schema.fieldMapping;

        if (fieldMapping && Object.keys(fieldMapping).length > 0) {
            // Apply field renaming from schema metadata
            for (const [wizardKey, value] of Object.entries(sourceObj)) {
                if (value === undefined || value === null) continue;
                const pipelineKey = fieldMapping[wizardKey] ?? wizardKey;
                result[pipelineKey] = value;
            }
        } else {
            Object.assign(result, sourceObj);
        }

        return result;
    }

    // Convention-based fallback when destination schemas are unavailable (intentional design)
    const configKey = `${destination.type.toLowerCase()}Config`;
    const config = (destination as Record<string, unknown>)[configKey];
    if (!config || typeof config !== 'object') return result;

    if (destination.type === 'FILE') {
        const sourceObj = config as Record<string, unknown>;
        for (const [wizardKey, value] of Object.entries(sourceObj)) {
            if (value === undefined || value === null) continue;
            const pipelineKey = FALLBACK_FILE_FIELD_MAPPING[wizardKey] ?? wizardKey;
            result[pipelineKey] = value;
        }
        return result;
    }

    Object.assign(result, config);
    return result;
}

/**
 * Convert an export wizard configuration into a PipelineDefinition.
 * Accepts an optional AdapterResolver for dynamic adapter code lookups,
 * optional trigger type schemas for schema-driven trigger config building,
 * and optional destination schemas for data-driven destination config building.
 * Falls back to convention-based defaults when not provided.
 */
export function exportConfigToPipelineDefinition(
    config: ExportConfiguration,
    resolver: AdapterResolver = defaultResolver,
    triggerSchemas?: TypedOptionValue[],
    destinationSchemas?: DestinationSchema[],
): PipelineDefinition {
    const trigger = buildExportTriggerStep(config, triggerSchemas);
    const extract = buildExportExtractStep(config);
    const transform = buildExportTransformStep(config);
    const output = buildExportOutputStep(config, resolver, destinationSchemas);

    const steps = [trigger, extract, transform, output];
    const edges = buildLinearEdges(steps.map(s => s.key));

    return {
        version: 1,
        name: config.name,
        description: config.description,
        steps,
        edges,
    };
}

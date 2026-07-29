import { DEFAULT_CHANNEL_CODE } from '../../shared/constants';
import type {
    JsonObject,
    OperatorConfig,
    PipelineDefinition,
    PipelineStepDefinition,
} from '../../shared/types';
import type { ImportConfiguration } from '../components/wizards/import-wizard/types';
import type { TypedOptionValue } from '../hooks/api/use-config-options';
import type {
    ImportExistingRecordStrategy,
    ImportSourceConfig,
    WizardStrategyMapping,
} from '../types/wizard';
import {
    buildAtomicRenameOperators,
    buildLinearEdges,
    buildTriggerConfig,
    normalizeJsonValue,
    serializeOperators,
    toJsonObject,
} from './wizard-pipeline-helpers';
import type {
    ImportAdapterResolver,
    LoaderAdapterInfo,
} from './wizard-pipeline-types';
import { normalizeWizardStrategyMappings } from './wizard-strategies';

interface ExtractResult {
    adapterCode: string;
    config: JsonObject;
}

type SourceConfigBuilder = (source: ImportSourceConfig) => ExtractResult;

const FORMAT_EXTRACTOR_OVERRIDES: Record<string, string> = {
    XLSX: 'xlsx',
};

const FILE_CONFIG_KEY_MAP: Record<string, string> = {
    hasHeaders: 'hasHeader',
};

const SOURCE_CONFIG_BUILDERS: Record<string, SourceConfigBuilder> = {
    FILE: source => {
        const file = source.fileConfig;
        if (!file) return { adapterCode: 'csv', config: {} };
        return resolveFileFormatExtractor(file.format, file);
    },
    API: source => {
        const apiConfig = source.apiConfig;
        return {
            adapterCode: 'httpApi',
            config: apiConfig
                ? toJsonObject(
                    {
                        url: apiConfig.url,
                        method: apiConfig.method,
                        headers: apiConfig.headers,
                        body: apiConfig.body,
                        pagination: apiConfig.pagination,
                    },
                    'source.apiConfig',
                )
                : {},
        };
    },
};

const defaultImportResolver: ImportAdapterResolver = {
    getLoaderAdapterCode: entityType => resolveLoaderCode(entityType),
};

function resolveLoaderCode(
    entityType: string,
    loaders?: Array<{ code: string; entityType?: string | null }>,
): string {
    if (loaders?.length) {
        const loader = loaders.find(
            candidate => candidate.entityType === entityType,
        );
        if (loader) return loader.code;
    }
    return `${entityType.replace(
        /-([a-z])/g,
        (_, character: string) => character.toUpperCase(),
    )}Upsert`;
}

function resolveFieldMappings(
    loaderCode: string,
    loaders?: Array<{
        code: string;
        schema?: { fields?: Array<{ key: string }> };
    }>,
): Record<string, string> {
    if (!loaders?.length) return {};
    const loader = loaders.find(candidate => candidate.code === loaderCode);
    if (!loader?.schema?.fields) return {};

    const metaFields = new Set([
        'strategy',
        'conflictStrategy',
        'channel',
        'lookupFields',
        'connectionCode',
    ]);

    return Object.fromEntries(
        loader.schema.fields
            .filter(field => !metaFields.has(field.key))
            .map(field => [field.key, field.key]),
    );
}

function resolveStrategyMapping(
    wizardValue: ImportExistingRecordStrategy,
    mappings: WizardStrategyMapping[],
): { loadStrategy: string; conflictStrategy: string } {
    const mapping = normalizeWizardStrategyMappings(mappings).find(
        candidate => candidate.wizardValue === wizardValue,
    );
    if (!mapping) throw new Error(`Unknown strategy: ${wizardValue}`);
    return {
        loadStrategy: mapping.loadStrategy,
        conflictStrategy: mapping.conflictStrategy,
    };
}

function resolveFileFormatExtractor(
    format: string,
    file: NonNullable<ImportSourceConfig['fileConfig']>,
): ExtractResult {
    const adapterCode =
        FORMAT_EXTRACTOR_OVERRIDES[format] ?? format.toLowerCase();
    const config: JsonObject = {};
    const wizardOnlyKeys = new Set(['format']);

    for (const [key, value] of Object.entries(file)) {
        if (
            wizardOnlyKeys.has(key)
            || value === undefined
            || value === null
            || value === ''
        ) {
            continue;
        }
        const configKey = FILE_CONFIG_KEY_MAP[key] ?? key;
        const normalized = normalizeJsonValue(
            value,
            `source.fileConfig.${key}`,
        );
        if (normalized !== undefined) config[configKey] = normalized;
    }

    return { adapterCode, config };
}

function buildImportTriggerStep(
    config: ImportConfiguration,
    triggerSchemas?: TypedOptionValue[],
): PipelineStepDefinition {
    return {
        key: 'trigger',
        type: 'TRIGGER',
        config: buildTriggerConfig(config.trigger, triggerSchemas),
    };
}

function buildImportExtractStep(
    config: ImportConfiguration,
): PipelineStepDefinition {
    const source = config.source;
    const builder = SOURCE_CONFIG_BUILDERS[source.type];

    let adapterCode: string;
    let extractConfig: JsonObject;

    if (builder) {
        const result = builder(source);
        adapterCode = result.adapterCode;
        extractConfig = result.config;
    } else {
        adapterCode = source.type;
        const dynamicConfigKey = `${source.type.toLowerCase()}Config`;
        const dynamicConfig = source[dynamicConfigKey];
        extractConfig =
            dynamicConfig && typeof dynamicConfig === 'object'
                ? toJsonObject(
                    dynamicConfig,
                    `source.${dynamicConfigKey}`,
                )
                : {};
    }

    return {
        key: 'extract',
        type: 'EXTRACT',
        config: { adapterCode, ...extractConfig },
    };
}

function buildImportTransformStep(
    config: ImportConfiguration,
): PipelineStepDefinition {
    const operators: OperatorConfig[] = buildAtomicRenameOperators(
        config.mappings.map(mapping => ({
            source: mapping.sourceField,
            target: mapping.targetField,
        })),
    );

    const defaults: Record<string, unknown> = {};
    for (const mapping of config.mappings) {
        const defaultValue = mapping.defaultValue;
        const isBlankString =
            typeof defaultValue === 'string'
            && defaultValue.trim().length === 0;
        if (
            mapping.targetField.trim().length > 0
            && defaultValue !== undefined
            && defaultValue !== null
            && !isBlankString
        ) {
            defaults[mapping.targetField] = defaultValue;
        }
    }
    if (Object.keys(defaults).length > 0) {
        operators.push({
            op: 'enrich',
            args: { defaults },
        });
    }

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
        config: { operators: serializeOperators(operators) },
    };
}

function buildImportLoadStep(
    config: ImportConfiguration,
    resolver: ImportAdapterResolver,
    loaderAdapters: LoaderAdapterInfo[] | undefined,
    strategyMappings: WizardStrategyMapping[],
): PipelineStepDefinition {
    const adapterCode =
        resolver.getLoaderAdapterCode(config.targetEntity)
        ?? resolveLoaderCode(config.targetEntity);
    const { loadStrategy, conflictStrategy } = resolveStrategyMapping(
        config.strategies.existingRecords,
        strategyMappings,
    );
    const schemaFieldMap = resolveFieldMappings(
        adapterCode,
        loaderAdapters,
    );
    const fieldConfig = buildLoaderFieldConfig(
        schemaFieldMap,
        config.mappings,
    );

    return {
        key: 'load',
        type: 'LOAD',
        continueOnError: config.strategies.continueOnError,
        throughput: {
            batchSize: config.strategies.batchSize,
            concurrency: config.strategies.parallelBatches,
        },
        config: {
            adapterCode,
            strategy: loadStrategy,
            channel: DEFAULT_CHANNEL_CODE,
            conflictStrategy,
            lookupFields: config.strategies.lookupFields,
            skipDuplicates:
                config.strategies.existingRecords === 'SKIP',
            ...fieldConfig,
        },
    };
}

function buildLoaderFieldConfig(
    schemaFieldMap: Record<string, string>,
    mappings: ImportConfiguration['mappings'],
): Record<string, string> {
    const fieldConfig: Record<string, string> = {};
    for (const mapping of mappings) {
        if (!mapping.targetField) continue;
        const target = mapping.targetField;
        if (schemaFieldMap[target]) {
            fieldConfig[schemaFieldMap[target]] = target;
            continue;
        }

        const suffixed = `${target}Field`;
        if (schemaFieldMap[suffixed]) {
            fieldConfig[suffixed] = target;
        }
    }
    return fieldConfig;
}

export function importConfigToPipelineDefinition(
    config: ImportConfiguration,
    strategyMappings: WizardStrategyMapping[],
    resolver: ImportAdapterResolver = defaultImportResolver,
    loaderAdapters?: LoaderAdapterInfo[],
    triggerSchemas?: TypedOptionValue[],
): PipelineDefinition {
    const steps = [
        buildImportTriggerStep(config, triggerSchemas),
        buildImportExtractStep(config),
        buildImportTransformStep(config),
        buildImportLoadStep(
            config,
            resolver,
            loaderAdapters,
            strategyMappings,
        ),
    ];

    return {
        version: 1,
        name: config.name,
        description: config.description,
        steps,
        edges: buildLinearEdges(steps.map(step => step.key)),
    };
}

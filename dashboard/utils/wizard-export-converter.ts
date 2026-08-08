import { getNestedValue, setNestedValue } from '../../shared';
import type {
    JsonObject,
    OperatorConfig,
    PipelineDefinition,
    PipelineStepDefinition,
} from '../../shared/types';
import type { ExportConfiguration } from '../components/wizards/export-wizard/types';
import type {
    DestinationSchema,
    TypedOptionValue,
} from '../hooks/api/use-config-options';
import type { DestinationConfig } from '../types/wizard';
import {
    buildAtomicRenameOperators,
    buildLinearEdges,
    buildTriggerConfig,
    normalizeJsonValue,
    serializeOperators,
    toJsonObject,
} from './wizard-pipeline-helpers';
import type { ExportAdapterResolver } from './wizard-pipeline-types';

const SUPPORTED_EXPORT_DESTINATION_TYPES = new Set([
    'LOCAL',
    'HTTP',
    'S3',
    'SFTP',
    'FTP',
    'EMAIL',
]);

const SUPPORTED_QUERY_FILTER_OPERATORS = new Set([
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'in',
    'contains',
]);

const defaultExportResolver: ExportAdapterResolver = {
    getExportAdapterCode: () => undefined,
};

function buildExportTriggerStep(
    config: ExportConfiguration,
    triggerSchemas?: TypedOptionValue[],
): PipelineStepDefinition {
    return {
        key: 'trigger',
        type: 'TRIGGER',
        config: buildTriggerConfig(config.trigger, triggerSchemas),
    };
}

function buildExportExtractStep(
    config: ExportConfiguration,
): PipelineStepDefinition {
    const extractConfig: JsonObject = {
        entity: config.sourceEntity,
        batchSize: config.options.batchSize,
    };

    if (config.sourceQuery?.orderBy) {
        extractConfig.sortBy = config.sourceQuery.orderBy;
        extractConfig.sortOrder =
            config.sourceQuery.orderDirection ?? 'ASC';
    }
    if (
        config.sourceQuery?.type === 'query'
        && config.filters?.length
    ) {
        extractConfig.filters = serializeExportFilters(config.filters);
    }

    return {
        key: 'extract',
        type: 'EXTRACT',
        config: { adapterCode: 'vendureQuery', ...extractConfig },
    };
}

function serializeExportFilters(
    filters: NonNullable<ExportConfiguration['filters']>,
): JsonObject[] {
    return filters.map((filter, index) => {
        if (!filter.field) {
            throw new Error(
                `Export filter ${index + 1} requires a field`,
            );
        }
        if (!SUPPORTED_QUERY_FILTER_OPERATORS.has(filter.operator)) {
            throw new Error(
                `Export filter operator "${filter.operator}" is not supported by vendureQuery`,
            );
        }
        return toJsonObject(
            {
                field: filter.field,
                operator: filter.operator,
                value: filter.value,
            },
            `filters[${index}]`,
        );
    });
}

function buildExportTransformStep(
    config: ExportConfiguration,
): PipelineStepDefinition {
    const operators: OperatorConfig[] = [];
    const includedFields = config.fields.filter(field => field.include);

    if (includedFields.length > 0) {
        operators.push({
            op: 'pick',
            args: {
                fields: includedFields.map(field => field.sourceField),
            },
        });
    }

    operators.push(
        ...buildAtomicRenameOperators(
            includedFields.map(field => ({
                source: field.sourceField,
                target: field.outputName,
            })),
        ),
    );

    appendFieldTransformations(operators, includedFields);

    return {
        key: 'transform',
        type: 'TRANSFORM',
        config: { operators: serializeOperators(operators) },
    };
}

function appendFieldTransformations(
    operators: OperatorConfig[],
    fields: ExportConfiguration['fields'],
): void {
    for (const field of fields) {
        if (!field.transformation) continue;
        const path = field.outputName || field.sourceField;
        switch (field.transformation) {
            case 'trim':
            case 'lowercase':
            case 'uppercase':
                operators.push({
                    op: field.transformation,
                    args: { path },
                });
                break;
            case 'stripHtml':
                operators.push({
                    op: field.transformation,
                    args: { source: path, target: path },
                });
                break;
            default:
                throw new Error(
                    `Export field transformation "${field.transformation}" requires configuration that the wizard does not collect`,
                );
        }
    }
}

function buildDestinationConfig(
    destination: DestinationConfig,
    destinationSchemas?: DestinationSchema[],
): JsonObject {
    const result: JsonObject = {
        destinationType: destination.type,
    };
    const destinationValues: Record<string, unknown> = { ...destination };

    if (!SUPPORTED_EXPORT_DESTINATION_TYPES.has(destination.type)) {
        throw new Error(
            `Unsupported export destination: ${destination.type}`,
        );
    }

    const schema = destinationSchemas?.find(
        candidate => candidate.type === destination.type,
    );
    if (destinationSchemas && !schema) {
        throw new Error(
            `Missing schema for export destination: ${destination.type}`,
        );
    }

    if (schema) {
        return buildSchemaDestinationConfig(
            result,
            destinationValues,
            schema,
        );
    }

    const configKey = `${destination.type.toLowerCase()}Config`;
    const destinationConfig = destinationValues[configKey];
    if (!destinationConfig || typeof destinationConfig !== 'object') {
        return result;
    }

    Object.assign(
        result,
        toJsonObject(destinationConfig, `destination.${configKey}`),
    );
    return result;
}

function buildSchemaDestinationConfig(
    result: JsonObject,
    destinationValues: Record<string, unknown>,
    schema: DestinationSchema,
): JsonObject {
    if (!schema.configKey) return result;

    const subConfig = destinationValues[schema.configKey];
    let sourceObject =
        subConfig && typeof subConfig === 'object'
            ? toJsonObject(subConfig, `destination.${schema.configKey}`)
            : {};

    for (const field of schema.fields) {
        if (
            getNestedValue(sourceObject, field.key) === undefined
            && field.defaultValue !== undefined
        ) {
            const defaultValue = normalizeJsonValue(
                field.defaultValue,
                `destination.${schema.configKey}.${field.key}`,
            );
            if (defaultValue !== undefined) {
                sourceObject = setNestedValue(
                    sourceObject,
                    field.key,
                    defaultValue,
                );
            }
        }
    }

    if (schema.fieldMapping && Object.keys(schema.fieldMapping).length > 0) {
        for (const [wizardKey, value] of Object.entries(sourceObject)) {
            if (value === undefined || value === null) continue;
            const pipelineKey = schema.fieldMapping[wizardKey] ?? wizardKey;
            result[pipelineKey] = value;
        }
    } else {
        Object.assign(result, sourceObject);
    }
    return result;
}

function buildExportOutputStep(
    config: ExportConfiguration,
    resolver: ExportAdapterResolver,
    destinationSchemas?: DestinationSchema[],
): PipelineStepDefinition {
    const formatType = config.format.type;
    const formatOptions = config.format.options;
    const destinationConfig = buildDestinationConfig(
        config.destination,
        destinationSchemas,
    );
    const normalizedFormatOptions = toJsonObject(
        formatOptions,
        'format.options',
    );
    const exportAdapter = resolver.getExportAdapterCode(formatType);
    if (!exportAdapter) {
        throw new Error(
            `No exporter adapter is registered for format "${formatType}"`,
        );
    }

    return {
        key: 'export',
        type: 'EXPORT',
        config: {
            adapterCode: exportAdapter,
            ...normalizedFormatOptions,
            ...destinationConfig,
        },
    };
}

export function exportConfigToPipelineDefinition(
    config: ExportConfiguration,
    resolver: ExportAdapterResolver = defaultExportResolver,
    triggerSchemas?: TypedOptionValue[],
    destinationSchemas?: DestinationSchema[],
): PipelineDefinition {
    const steps = [
        buildExportTriggerStep(config, triggerSchemas),
        buildExportExtractStep(config),
        buildExportTransformStep(config),
        buildExportOutputStep(config, resolver, destinationSchemas),
    ];

    return {
        version: 1,
        name: config.name,
        description: config.description,
        steps,
        edges: buildLinearEdges(steps.map(step => step.key)),
    };
}

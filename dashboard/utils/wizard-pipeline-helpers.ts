import { setNestedValue } from '../../shared';
import type {
    JsonObject,
    JsonValue,
    OperatorConfig,
    PipelineEdge,
} from '../../shared/types';
import type { TypedOptionValue } from '../hooks/api/use-config-options';
import type {
    ExportTriggerConfig,
    ImportTriggerConfig,
} from '../types/wizard';

export function normalizeJsonValue(
    value: unknown,
    path: string,
): JsonValue | undefined {
    if (value === undefined) return undefined;
    if (
        value === null
        || typeof value === 'string'
        || typeof value === 'boolean'
    ) {
        return value;
    }
    if (typeof value === 'number') {
        if (Number.isFinite(value)) return value;
        throw new Error(
            `Pipeline config at "${path}" must contain a finite number`,
        );
    }
    if (Array.isArray(value)) {
        return value.map(
            (item, index) =>
                normalizeJsonValue(item, `${path}[${index}]`) ?? null,
        );
    }
    if (typeof value === 'object') {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new Error(
                `Pipeline config at "${path}" must contain only JSON values`,
            );
        }
        return toJsonObject(value, path);
    }
    throw new Error(
        `Pipeline config at "${path}" must contain only JSON values`,
    );
}

export function toJsonObject(value: object, path: string): JsonObject {
    const result: JsonObject = {};
    for (const [key, child] of Object.entries(value)) {
        const normalized = normalizeJsonValue(child, `${path}.${key}`);
        if (normalized !== undefined) result[key] = normalized;
    }
    return result;
}

export function serializeOperators(
    operators: OperatorConfig[],
): JsonObject[] {
    return operators.map((operator, index) => {
        const serialized: JsonObject = { op: operator.op };
        if (operator.args) {
            serialized.args = toJsonObject(
                operator.args,
                `operators[${index}].args`,
            );
        }
        return serialized;
    });
}

export function generatePipelineCode(name: string): string {
    return (
        name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'untitled-pipeline'
    );
}

export function buildLinearEdges(stepKeys: string[]): PipelineEdge[] {
    const edges: PipelineEdge[] = [];
    for (let index = 0; index < stepKeys.length - 1; index++) {
        edges.push({ from: stepKeys[index], to: stepKeys[index + 1] });
    }
    return edges;
}

export function buildTriggerConfig(
    trigger: ImportTriggerConfig | ExportTriggerConfig,
    triggerSchemas?: TypedOptionValue[],
): JsonObject {
    const triggerValues: Record<string, unknown> = { ...trigger };
    const schema = triggerSchemas?.find(
        candidate => candidate.value === trigger.type,
    );
    if (schema) {
        return buildSchemaTriggerConfig(
            trigger.type,
            triggerValues,
            schema,
        );
    }
    return buildFallbackTriggerConfig(trigger.type, triggerValues);
}

function buildSchemaTriggerConfig(
    triggerType: string,
    triggerValues: Record<string, unknown>,
    schema: TypedOptionValue,
): JsonObject {
    let config: JsonObject = { type: triggerType };
    for (const field of schema.fields) {
        const value = triggerValues[field.key];
        if (value === undefined || value === null || value === '') continue;

        const configKey = schema.configKeyMap?.[field.key] ?? field.key;
        const normalized = normalizeJsonValue(
            value,
            `trigger.${field.key}`,
        );
        if (normalized !== undefined) {
            config = setNestedValue(config, configKey, normalized);
        }
    }
    return config;
}

function buildFallbackTriggerConfig(
    triggerType: string,
    triggerValues: Record<string, unknown>,
): JsonObject {
    const config: JsonObject = { type: triggerType };

    if (
        triggerType === 'SCHEDULE'
        && typeof triggerValues.schedule === 'string'
    ) {
        config.cron = triggerValues.schedule;
    }
    if (
        triggerType === 'FILE'
        && typeof triggerValues.connectionCode === 'string'
        && typeof triggerValues.path === 'string'
    ) {
        const fileWatch: JsonObject = {
            connectionCode: triggerValues.connectionCode,
            path: triggerValues.path,
        };
        for (const field of [
            'pattern',
            'recursive',
            'minFileAge',
            'pollIntervalMs',
        ] as const) {
            const value = triggerValues[field];
            if (value === undefined || value === null || value === '') continue;
            const normalized = normalizeJsonValue(value, `trigger.${field}`);
            if (normalized !== undefined) fileWatch[field] = normalized;
        }
        config.fileWatch = fileWatch;
    }
    if (
        triggerType === 'EVENT'
        && typeof triggerValues.event === 'string'
    ) {
        config.event = triggerValues.event;
    }
    return config;
}

export function buildAtomicRenameOperators(
    fields: Array<{ source: string; target: string }>,
): OperatorConfig[] {
    const mapping: Record<string, string> = {};
    const sources = new Set<string>();
    const targets = new Set<string>();

    for (const field of fields) {
        const source = field.source.trim();
        const target = field.target.trim();
        if (!source || !target || source === target) continue;

        const existingSource = mapping[target];
        if (existingSource && existingSource !== source) {
            throw new Error(
                `Multiple source fields cannot map to target field "${target}"`,
            );
        }
        mapping[target] = source;
        sources.add(source);
        targets.add(target);
    }

    if (Object.keys(mapping).length === 0) return [];

    const operators: OperatorConfig[] = [
        {
            op: 'map',
            args: { mapping, passthrough: true },
        },
    ];
    for (const source of sources) {
        if (!targets.has(source)) {
            operators.push({ op: 'remove', args: { path: source } });
        }
    }
    return operators;
}

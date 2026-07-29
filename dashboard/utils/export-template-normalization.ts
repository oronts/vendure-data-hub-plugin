export interface NormalizedExportTemplateField {
    sourceField: string;
    outputName: string;
}

export interface NormalizedExportTemplateDefinition {
    sourceEntity?: string;
    fields?: NormalizedExportTemplateField[];
    formatOptions?: Record<string, unknown>;
}

export interface ExportTemplateInput {
    id: string;
    name: string;
    description: string;
    icon?: string | null;
    format: string;
    requiredFields?: string[] | null;
    tags?: string[] | null;
    definition?: Record<string, unknown> | null;
}

export interface NormalizedExportTemplate {
    id: string;
    name: string;
    description: string;
    icon?: string;
    format: string;
    requiredFields: string[];
    tags?: string[];
    definition?: NormalizedExportTemplateDefinition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeExportEntityType(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.trim().length === 0) return undefined;

    const normalized = value
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();

    return normalized || undefined;
}

function normalizeFields(value: unknown): NormalizedExportTemplateField[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const fields = value
        .filter((field): field is string => typeof field === 'string')
        .map(field => field.trim())
        .filter(Boolean)
        .map(field => ({ sourceField: field, outputName: field }));

    return fields.length > 0 ? fields : undefined;
}

function normalizeDefinition(
    value: Record<string, unknown> | null | undefined,
): NormalizedExportTemplateDefinition | undefined {
    if (!isRecord(value)) return undefined;

    const sourceEntity = normalizeExportEntityType(value.sourceEntity);
    const fields = normalizeFields(value.fields);
    const formatOptions = isRecord(value.formatOptions) ? value.formatOptions : undefined;
    if (!sourceEntity && !fields && !formatOptions) return undefined;

    return { sourceEntity, fields, formatOptions };
}

export function normalizeExportTemplate(
    template: ExportTemplateInput,
): NormalizedExportTemplate {
    return {
        id: template.id,
        name: template.name,
        description: template.description,
        icon: template.icon ?? undefined,
        format: template.format.trim().toUpperCase(),
        requiredFields: template.requiredFields ?? [],
        tags: template.tags ?? undefined,
        definition: normalizeDefinition(template.definition),
    };
}

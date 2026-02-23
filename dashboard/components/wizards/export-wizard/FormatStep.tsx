import { useCallback, useMemo, memo } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@vendure/dashboard';
import { FileText } from 'lucide-react';
import { resolveIconName } from '../../../utils/icon-resolver';
import { WizardStepContainer } from '../shared';
import { SelectableCard, SelectableCardGrid } from '../../shared/selectable-card';
import { SchemaFormRenderer } from '../../shared/schema-form';
import { STEP_CONTENT } from './constants';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import type { AdapterSchemaField } from '../../../types';
import type { FeedTemplate } from '../../../types/wizard';
import type { ExportConfiguration } from './types';
import type { DataHubAdaptersApiQuery } from '../../../gql/graphql';

type AdapterEntry = DataHubAdaptersApiQuery['dataHubAdapters'][number];

/** Group identifier used on backend exporter schema fields that represent format options */
const FORMAT_OPTIONS_GROUP = 'format-options';

interface FormatStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    errors?: Record<string, string>;
}

function resolveBaseFormat(adapter: { code: string; formatType?: string | null; description?: string | null }): string {
    // Prefer backend formatType metadata
    if (adapter.formatType) return adapter.formatType;
    // Infer from description as last resort
    if (adapter.description && /\bxml\b/i.test(adapter.description)) return 'XML';
    if (adapter.description && /\bjson\b/i.test(adapter.description)) return 'JSON';
    return 'CSV';
}

/** Derive a wizard format ID from an adapter code */
function toFormatId(code: string): string {
    return code.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

export function FormatStep({ config, updateConfig, errors = {} }: FormatStepProps) {
    const format = config.format ?? { type: 'CSV', options: {} };
    const { data: exporters } = useAdaptersByType('EXPORTER');
    const { data: feeds } = useAdaptersByType('FEED');

    // Build format templates dynamically from backend adapter registry
    const formatTemplates = useMemo(() => {
        const templates: FeedTemplate[] = [];

        // Add feed formats from backend (Google Shopping, Meta, Amazon, etc.)
        if (feeds?.length) {
            for (const feed of feeds) {
                templates.push({
                    id: toFormatId(feed.code),
                    name: feed.name ?? feed.code,
                    icon: resolveIconName(feed.icon) ?? FileText,
                    description: feed.description ?? '',
                    format: resolveBaseFormat(feed),
                    requiredFields: [],
                });
            }
        }

        // Add standard export formats from backend (CSV, JSON, XML)
        if (exporters?.length) {
            for (const exp of exporters) {
                const formatCode = exp.code.replace(/[Ee]xport/, '');
                templates.push({
                    id: `custom-${formatCode.toLowerCase()}`,
                    name: exp.name ?? `Custom ${formatCode.toUpperCase()}`,
                    icon: resolveIconName(exp.icon) ?? FileText,
                    description: exp.description ?? '',
                    format: formatCode.toUpperCase(),
                    requiredFields: [],
                });
            }
        }

        return templates;
    }, [exporters, feeds]);

    return (
        <WizardStepContainer
            title={STEP_CONTENT.format.title}
            description={STEP_CONTENT.format.description}
        >
            <FormatTemplateSelection format={format} updateConfig={updateConfig} templates={formatTemplates} />
            <FormatOptionsCard format={format} updateConfig={updateConfig} templates={formatTemplates} exporters={exporters} />
        </WizardStepContainer>
    );
}

interface FormatTemplateSelectionProps {
    format: ExportConfiguration['format'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    templates: FeedTemplate[];
}

function FormatTemplateSelection({ format, updateConfig, templates }: FormatTemplateSelectionProps) {
    return (
        <SelectableCardGrid columns={3}>
            {templates.map(template => (
                <FormatTemplateCard
                    key={template.id}
                    template={template}
                    format={format}
                    updateConfig={updateConfig}
                />
            ))}
        </SelectableCardGrid>
    );
}

interface FormatTemplateCardProps {
    template: FeedTemplate;
    format: ExportConfiguration['format'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

const FormatTemplateCard = memo(function FormatTemplateCard({
    template,
    format,
    updateConfig,
}: FormatTemplateCardProps) {
    const isSelected = format.type === template.id ||
        (template.id.startsWith('custom-') && format.type === template.format);

    const handleClick = useCallback(() => {
        const formatType = template.id.startsWith('custom-')
            ? template.id.replace('custom-', '').toUpperCase()
            : template.id;
        updateConfig({
            format: {
                type: formatType,
                options: {
                    ...format.options,
                    feedTemplate: template.id.startsWith('custom-') ? undefined : template.id,
                },
            },
        });
    }, [template.id, format.options, updateConfig]);

    return (
        <SelectableCard
            icon={template.icon}
            title={template.name}
            description={template.description}
            selected={isSelected}
            onClick={handleClick}
            data-testid={`datahub-export-format-${template.id}-btn`}
        />
    );
});

interface FormatOptionsCardProps {
    format: ExportConfiguration['format'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    templates: FeedTemplate[];
    exporters: AdapterEntry[] | undefined;
}

function FormatOptionsCard({ format, updateConfig, templates, exporters }: FormatOptionsCardProps) {
    const selectedTemplate = templates.find(t => t.id === format.type);
    const baseFormat = selectedTemplate?.format ?? format.type;

    // Schema-driven: find the exporter adapter matching the base format
    // and extract its format-options fields. Strip the group so SchemaFormRenderer
    // does not render a redundant sub-heading (the Card title already says "Format Options").
    // Map GraphQL `defaultValue` to shared `default` so SchemaFormRenderer resolves defaults correctly.
    const formatOptionsSchema = useMemo(() => {
        if (!exporters?.length) return null;
        const matchingExporter = exporters.find(e => e.formatType === baseFormat);
        if (!matchingExporter) return null;
        const formatFields: AdapterSchemaField[] = matchingExporter.schema.fields
            .filter(f => f.group === FORMAT_OPTIONS_GROUP)
            .map(f => ({
                key: f.key,
                label: f.label ?? undefined,
                description: f.description ?? undefined,
                type: f.type as AdapterSchemaField['type'],
                required: f.required ?? undefined,
                default: f.defaultValue ?? undefined,
                options: f.options?.map(o => ({ value: o.value, label: o.label })) ?? undefined,
                placeholder: f.placeholder ?? undefined,
                validation: f.validation ? {
                    min: f.validation.min ?? undefined,
                    max: f.validation.max ?? undefined,
                    minLength: f.validation.minLength ?? undefined,
                    maxLength: f.validation.maxLength ?? undefined,
                    pattern: f.validation.pattern ?? undefined,
                    patternMessage: f.validation.patternMessage ?? undefined,
                } : undefined,
                dependsOn: f.dependsOn ? {
                    field: f.dependsOn.field,
                    value: f.dependsOn.value ?? undefined,
                    operator: f.dependsOn.operator as NonNullable<AdapterSchemaField['dependsOn']>['operator'],
                } : undefined,
            }));
        if (formatFields.length === 0) return null;
        return { fields: formatFields };
    }, [exporters, baseFormat]);

    const handleSchemaChange = useCallback((values: Record<string, unknown>) => {
        updateConfig({
            format: { ...format, options: { ...format.options, ...values } },
        });
    }, [format, updateConfig]);

    // Build current values from format.options for the schema fields,
    // falling back to the schema field's defaultValue when no user value exists.
    const schemaValues = useMemo(() => {
        if (!formatOptionsSchema) return {};
        const values: Record<string, unknown> = {};
        for (const field of formatOptionsSchema.fields) {
            const val = (format.options as Record<string, unknown>)[field.key];
            values[field.key] = val ?? field.default;
        }
        return values;
    }, [formatOptionsSchema, format.options]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Format Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {formatOptionsSchema ? (
                    <SchemaFormRenderer
                        schema={formatOptionsSchema}
                        values={schemaValues}
                        onChange={handleSchemaChange}
                        compact
                    />
                ) : (
                    <p className="text-sm text-muted-foreground">
                        No format-specific options available for this export type.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

import { useCallback, useMemo, memo } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@vendure/dashboard';
import { FileText } from 'lucide-react';
import { mapAdapterSchema } from '../../../utils/adapter-schema';
import { resolveIconName } from '../../../utils/icon-resolver';
import { WizardStepContainer } from '../shared';
import { SelectableCard, SelectableCardGrid } from '../../shared/selectable-card';
import { SchemaFormRenderer } from '../../shared/schema-form';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import { useAdapterCodeMappings } from '../../../hooks/api/use-config-options';
import type { FeedTemplate } from '../../../types/wizard';
import type { ExportConfiguration } from './types';
import type { DataHubAdaptersApiQuery } from '../../../gql/graphql';

type AdapterEntry = DataHubAdaptersApiQuery['dataHubAdapters'][number];

/** Group identifier used on backend exporter schema fields that represent format options */
const FORMAT_OPTIONS_GROUP = 'format-options';

interface FormatStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

export function FormatStep({ config, updateConfig }: FormatStepProps) {
    const { t } = useLingui();
    const format = config.format ?? { type: 'CSV', options: {} };
    const { data: exporters } = useAdaptersByType('EXPORTER');
    const { mappings: exportMappings } = useAdapterCodeMappings('exportAdapterCodes');

    // Export mappings are the backend's authoritative list of format exporters.
    const formatTemplates = useMemo(() => {
        return exportMappings.map(mapping => {
            const exporter = exporters?.find(candidate => candidate.code === mapping.adapterCode);
            return {
                id: `custom-${mapping.value.toLowerCase()}`,
                name: mapping.label,
                icon: resolveIconName(exporter?.icon) ?? FileText,
                description: exporter?.description ?? '',
                format: mapping.value,
                requiredFields: [],
            } satisfies FeedTemplate;
        });
    }, [exportMappings, exporters]);

    return (
        <WizardStepContainer
            title={t`Output Format`}
            description={t`Choose the output format and configure options`}
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

    // Schema-driven: find the exporter adapter matching the base format and
    // strip the group so the card does not repeat its own heading.
    const formatOptionsSchema = useMemo(() => {
        if (!exporters?.length) return null;
        const matchingExporter = exporters.find(e => e.formatType === baseFormat);
        if (!matchingExporter) return null;
        const formatFields = mapAdapterSchema(matchingExporter.schema).fields
            .filter(f => f.group === FORMAT_OPTIONS_GROUP)
            .map(({ group: _group, ...field }) => field);
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
                <CardTitle><Trans>Format Options</Trans></CardTitle>
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
                        <Trans>No additional options are available for this format.</Trans>
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

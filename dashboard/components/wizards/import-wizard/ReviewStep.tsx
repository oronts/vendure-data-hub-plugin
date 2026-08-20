import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Badge } from '@vendure/dashboard';
import {
    Database,
    Table,
    Columns,
    Clock,
    ArrowRight,
} from 'lucide-react';
import { VENDURE_ENTITY_LIST } from '../../../../shared';
import { WizardStepContainer } from '../shared';
import { ConfigurationNameCard, ReviewSection, SummaryCard, SummaryCardGrid, SummaryField } from '../../shared/wizard';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import { formatKey } from '../../../utils/formatters';
import type { ImportConfiguration } from './types';
import type { ImportSourceConfig } from '../../../types/wizard';

interface ReviewStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function ReviewStep({ config, updateConfig, errors = {} }: ReviewStepProps) {
    const { t } = useLingui();
    const mappedFieldsCount = config.mappings?.filter(m => m.sourceField && m.targetField).length ?? 0;
    const requiredFieldsCount = config.mappings?.filter(m => m.required).length ?? 0;

    return (
        <WizardStepContainer
            title={t`Review import`}
            description={t`Review the configuration before creating the import.`}
        >
            <ConfigurationNameCard
                title={t`Import details`}
                name={config.name ?? ''}
                description={config.description ?? ''}
                onNameChange={name => updateConfig({ name })}
                onDescriptionChange={description => updateConfig({ description })}
                namePlaceholder={t`My product import`}
                nameError={errors.name}
                nameHelperText={t`A descriptive name to identify this import configuration`}
            />
            <SummaryCards
                config={config}
                mappedFieldsCount={mappedFieldsCount}
                requiredFieldsCount={requiredFieldsCount}
            />
            <DetailedConfigAccordion
                config={config}
                mappedFieldsCount={mappedFieldsCount}
            />
        </WizardStepContainer>
    );
}

interface SummaryCardsProps {
    config: Partial<ImportConfiguration>;
    mappedFieldsCount: number;
    requiredFieldsCount: number;
}

function SummaryCards({ config, mappedFieldsCount, requiredFieldsCount }: SummaryCardsProps) {
    const { t } = useLingui();

    return (
        <SummaryCardGrid columns={4}>
            <SummaryCard
                icon={Database}
                label={t`Source`}
                value={<span className="capitalize">{config.source?.type}</span>}
            />
            <SummaryCard
                icon={Table}
                label={t`Target`}
                value={VENDURE_ENTITY_LIST.find(e => e.code === config.targetEntity)?.name}
            />
            <SummaryCard
                icon={Columns}
                label={t`Mappings`}
                value={mappedFieldsCount === 1
                    ? t`${mappedFieldsCount} field (${requiredFieldsCount} required)`
                    : t`${mappedFieldsCount} fields (${requiredFieldsCount} required)`}
            />
            <SummaryCard
                icon={Clock}
                label={t`Trigger`}
                value={<span className="capitalize">{config.trigger?.type}</span>}
            />
        </SummaryCardGrid>
    );
}

interface DetailedConfigAccordionProps {
    config: Partial<ImportConfiguration>;
    mappedFieldsCount: number;
}

function DetailedConfigAccordion({ config, mappedFieldsCount }: DetailedConfigAccordionProps) {
    const { t } = useLingui();

    return (
        <div>
            <ReviewSection title={<Trans>Source configuration</Trans>} defaultOpen>
                <SourceConfigSummary source={config.source} />
            </ReviewSection>

            <ReviewSection title={t`Field mappings (${mappedFieldsCount})`} defaultOpen>
                <div className="space-y-2">
                    {config.mappings?.filter(m => m.sourceField && m.targetField).map(m => (
                        <div key={m.targetField} className="flex items-center gap-3 p-2 bg-muted rounded">
                            <code className="text-xs">{m.sourceField}</code>
                            <ArrowRight className="w-4 h-4" />
                            <code className="text-xs">{m.targetField}</code>
                            {m.required && (
                                <Badge variant="destructive" className="text-[10px]">
                                    <Trans>Required</Trans>
                                </Badge>
                            )}
                        </div>
                    ))}
                </div>
            </ReviewSection>

            <ReviewSection title={<Trans>Import strategy</Trans>} defaultOpen>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <SummaryField label={t`Existing records`}>{config.strategies?.existingRecords}</SummaryField>
                    <SummaryField label={t`Lookup fields`}>{config.strategies?.lookupFields?.join(', ')}</SummaryField>
                    <SummaryField label={t`Batch size`}>{config.strategies?.batchSize}</SummaryField>
                </div>
            </ReviewSection>

            {(config.transformations?.length ?? 0) > 0 && (
                <ReviewSection title={t`Transformations (${config.transformations?.length ?? 0})`}>
                    <div className="space-y-2">
                        {config.transformations?.map((transformation, index) => (
                            <div key={transformation.id} className="flex items-center gap-3 p-2 bg-muted rounded">
                                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                                    {index + 1}
                                </span>
                                <span className="capitalize font-medium">{transformation.type}</span>
                            </div>
                        ))}
                    </div>
                </ReviewSection>
            )}
        </div>
    );
}

/**
 * Defines which fields to display in the summary for each source type.
 */
interface SourceSummaryFieldDef {
    /** Field name relative to the source config sub-object */
    field: string;
    label: string;
    colSpan?: 2;
    className?: string;
}

/**
 * Registry mapping source type to its config sub-object key and displayable fields.
 * Adding a new source type requires only a new entry here.
 */
const SOURCE_SUMMARY_REGISTRY: Record<string, {
    configKey: string;
    fields: SourceSummaryFieldDef[];
}> = {
    FILE: {
        configKey: 'fileConfig',
        fields: [
            { field: 'format', label: 'Format' },
            { field: 'hasHeaders', label: 'Has headers' },
            { field: 'delimiter', label: 'Delimiter' },
        ],
    },
    API: {
        configKey: 'apiConfig',
        fields: [
            { field: 'method', label: 'Method' },
            { field: 'url', label: 'URL', colSpan: 2, className: 'break-all' },
        ],
    },
};

function SourceConfigSummary({ source }: { source?: ImportSourceConfig }) {
    const { t } = useLingui();
    const { data: extractors } = useAdaptersByType('EXTRACTOR');

    if (!source) {
        return (
            <p className="text-sm text-muted-foreground">
                <Trans>No source configured</Trans>
            </p>
        );
    }

    const registry = SOURCE_SUMMARY_REGISTRY[source.type];
    const sourceRecord: Record<string, unknown> = { ...source };
    const configObj = registry
        ? sourceRecord[registry.configKey] as Record<string, unknown> | undefined
        : undefined;

    return (
        <div className="grid grid-cols-2 gap-4 text-sm">
            <SummaryField label={t`Type`} className="capitalize">{source.type?.toLowerCase()}</SummaryField>

            {registry && configObj ? (
                registry.fields.map(def => {
                    const rawValue = configObj[def.field];
                    const displayValue = def.field === 'hasHeaders'
                        ? rawValue ? t`Yes` : t`No`
                        : def.field === 'delimiter'
                            ? !rawValue || rawValue === ','
                                ? null
                                : rawValue === '\t' ? t`Tab` : String(rawValue)
                            : rawValue;
                    if (displayValue == null || displayValue === '') return null;
                    const label = def.field === 'format'
                        ? t`Format`
                        : def.field === 'hasHeaders'
                            ? t`Has headers`
                            : def.field === 'delimiter'
                                ? t`Delimiter`
                                : def.field === 'method'
                                    ? t`Method`
                                    : t`URL`;
                    return (
                        <SummaryField key={def.field} label={label} colSpan={def.colSpan} className={def.className}>
                            {String(displayValue)}
                        </SummaryField>
                    );
                })
            ) : (
                renderDynamicSourceFields(source, extractors)
            )}
        </div>
    );
}

/**
 * Renders source config fields for dynamic source types (DATABASE, CDC, WEBHOOK, etc.).
 * Uses the backend adapter schema for field labels when available, falling back
 * to auto-generated labels from camelCase field names.
 */
function renderDynamicSourceFields(
    source: ImportSourceConfig,
    extractors?: Array<{ code: string; schema?: { fields: Array<{ key: string; label?: string | null }> } | null }>,
): React.ReactNode {
    const configKey = `${source.type.toLowerCase()}Config`;
    const config = (source as Record<string, unknown>)[configKey] as Record<string, unknown> | undefined;
    if (!config) return null;

    // Find matching adapter for schema field labels
    const adapter = extractors?.find(
        e => e.code.toUpperCase() === source.type.toUpperCase(),
    );
    const schemaFields = adapter?.schema?.fields;

    return Object.entries(config)
        .filter(([, v]) => v != null && v !== '' && v !== false)
        .map(([key, value]) => {
            const schemaField = schemaFields?.find(f => f.key === key);
            const label = schemaField?.label ?? formatKey(key);
            return (
                <SummaryField key={key} label={label}>
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </SummaryField>
            );
        });
}

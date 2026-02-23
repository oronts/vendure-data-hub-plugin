import * as React from 'react';
import {
    Badge,
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@vendure/dashboard';
import {
    Database,
    Table,
    Columns,
    Clock,
    ArrowRight,
} from 'lucide-react';
import { VENDURE_ENTITY_LIST } from '../../../../shared';
import { WizardStepContainer } from '../shared';
import { ConfigurationNameCard, SummaryCard, SummaryCardGrid, SummaryField } from '../../shared/wizard';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import { formatFieldLabel } from '../../../utils/formatters';
import { STEP_CONTENT, IMPORT_PLACEHOLDERS } from './constants';
import type { ImportConfiguration } from './types';
import type { ImportSourceConfig } from '../../../types/wizard';

interface ReviewStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function ReviewStep({ config, updateConfig, errors = {} }: ReviewStepProps) {
    const mappedFieldsCount = config.mappings?.filter(m => m.sourceField && m.targetField).length ?? 0;
    const requiredFieldsCount = config.mappings?.filter(m => m.required).length ?? 0;

    return (
        <WizardStepContainer
            title={STEP_CONTENT.review.title}
            description={STEP_CONTENT.review.description}
        >
            <ConfigurationNameCard
                title={STEP_CONTENT.review.cardTitle}
                name={config.name ?? ''}
                description={config.description ?? ''}
                onNameChange={name => updateConfig({ name })}
                onDescriptionChange={description => updateConfig({ description })}
                namePlaceholder={IMPORT_PLACEHOLDERS.configName}
                nameError={errors.name}
                nameHelperText="A descriptive name to identify this import configuration"
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
    return (
        <SummaryCardGrid columns={4}>
            <SummaryCard
                icon={Database}
                label="Source"
                value={<span className="capitalize">{config.source?.type}</span>}
            />
            <SummaryCard
                icon={Table}
                label="Target"
                value={VENDURE_ENTITY_LIST.find(e => e.code === config.targetEntity)?.name}
            />
            <SummaryCard
                icon={Columns}
                label="Mappings"
                value={`${mappedFieldsCount} fields (${requiredFieldsCount} required)`}
            />
            <SummaryCard
                icon={Clock}
                label="Trigger"
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
    return (
        <Accordion type="multiple" defaultValue={['source', 'mappings', 'strategy']}>
            <AccordionItem value="source">
                <AccordionTrigger>Source Configuration</AccordionTrigger>
                <AccordionContent>
                    <SourceConfigSummary source={config.source} />
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="mappings">
                <AccordionTrigger>Field Mappings ({mappedFieldsCount})</AccordionTrigger>
                <AccordionContent>
                    <div className="space-y-2">
                        {config.mappings?.filter(m => m.sourceField && m.targetField).map(m => (
                            <div key={m.targetField} className="flex items-center gap-3 p-2 bg-muted rounded">
                                <code className="text-xs">{m.sourceField}</code>
                                <ArrowRight className="w-4 h-4" />
                                <code className="text-xs">{m.targetField}</code>
                                {m.required && <Badge variant="destructive" className="text-[10px]">req</Badge>}
                            </div>
                        ))}
                    </div>
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="strategy">
                <AccordionTrigger>Import Strategy</AccordionTrigger>
                <AccordionContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <SummaryField label="Existing records">{config.strategies?.existingRecords}</SummaryField>
                        <SummaryField label="New records">{config.strategies?.newRecords}</SummaryField>
                        <SummaryField label="Lookup fields">{config.strategies?.lookupFields?.join(', ')}</SummaryField>
                        <SummaryField label="Batch size">{config.strategies?.batchSize}</SummaryField>
                    </div>
                </AccordionContent>
            </AccordionItem>

            {(config.transformations?.length ?? 0) > 0 && (
                <AccordionItem value="transforms">
                    <AccordionTrigger>Transformations ({config.transformations?.length})</AccordionTrigger>
                    <AccordionContent>
                        <div className="space-y-2">
                            {config.transformations?.map((t, i) => (
                                <div key={t.id} className="flex items-center gap-3 p-2 bg-muted rounded">
                                    <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                                        {i + 1}
                                    </span>
                                    <span className="capitalize font-medium">{t.type}</span>
                                </div>
                            ))}
                        </div>
                    </AccordionContent>
                </AccordionItem>
            )}
        </Accordion>
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
    /** Custom value formatter. Return null to skip the field. */
    format?: (value: unknown, config: Record<string, unknown>) => React.ReactNode | null;
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
            { field: 'hasHeaders', label: 'Has headers', format: (v) => v ? 'Yes' : 'No' },
            {
                field: 'delimiter', label: 'Delimiter',
                format: (v) => {
                    if (!v || v === ',') return null;
                    return v === '\t' ? 'Tab' : String(v);
                },
            },
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
    const { data: extractors } = useAdaptersByType('EXTRACTOR');

    if (!source) return <p className="text-sm text-muted-foreground">No source configured</p>;

    const registry = SOURCE_SUMMARY_REGISTRY[source.type];
    const configObj = registry
        ? (source as Record<string, unknown>)[registry.configKey] as Record<string, unknown> | undefined
        : undefined;

    return (
        <div className="grid grid-cols-2 gap-4 text-sm">
            <SummaryField label="Type" className="capitalize">{source.type?.toLowerCase()}</SummaryField>

            {registry && configObj ? (
                registry.fields.map(def => {
                    const rawValue = configObj[def.field];
                    const displayValue = def.format ? def.format(rawValue, configObj) : rawValue;
                    if (displayValue == null || displayValue === '') return null;
                    return (
                        <SummaryField key={def.field} label={def.label} colSpan={def.colSpan} className={def.className}>
                            {typeof displayValue === 'object' ? String(displayValue) : displayValue}
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
            const label = schemaField?.label ?? formatFieldLabel(key);
            return (
                <SummaryField key={key} label={label}>
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </SummaryField>
            );
        });
}

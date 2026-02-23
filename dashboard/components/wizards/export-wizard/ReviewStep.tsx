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
    Columns,
    FileSpreadsheet,
    Send,
} from 'lucide-react';
import { VENDURE_ENTITY_LIST } from '../../../../shared';
import { useDestinationSchemas } from '../../../hooks/api/use-config-options';
import { formatFieldLabel } from '../../../utils/formatters';
import { WizardStepContainer } from '../shared';
import { ConfigurationNameCard, SummaryCard, SummaryCardGrid, SummaryField } from '../../shared/wizard';
import { STEP_CONTENT, EXPORT_PLACEHOLDERS } from './constants';
import type { ExportConfiguration } from './types';
import type { QueryConfig, DestinationConfig } from '../../../types/wizard';

interface ReviewStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function ReviewStep({ config, updateConfig, errors = {} }: ReviewStepProps) {
    const selectedFieldsCount = config.fields?.filter(f => f.include).length ?? 0;

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
                namePlaceholder={EXPORT_PLACEHOLDERS.configName}
                nameError={errors.name}
                nameHelperText="A descriptive name to identify this export configuration"
            />
            <SummaryCards config={config} selectedFieldsCount={selectedFieldsCount} />
            <DetailedConfigAccordion config={config} selectedFieldsCount={selectedFieldsCount} />
        </WizardStepContainer>
    );
}

interface SummaryCardsProps {
    config: Partial<ExportConfiguration>;
    selectedFieldsCount: number;
}

function SummaryCards({ config, selectedFieldsCount }: SummaryCardsProps) {
    return (
        <SummaryCardGrid columns={4}>
            <SummaryCard
                icon={Database}
                label="Source"
                value={VENDURE_ENTITY_LIST.find(e => e.code === config.sourceEntity)?.name}
            />
            <SummaryCard
                icon={Columns}
                label="Fields"
                value={`${selectedFieldsCount} selected`}
            />
            <SummaryCard
                icon={FileSpreadsheet}
                label="Format"
                value={<span className="uppercase">{config.format?.type}</span>}
            />
            <SummaryCard
                icon={Send}
                label="Destination"
                value={<span className="capitalize">{config.destination?.type}</span>}
            />
        </SummaryCardGrid>
    );
}

interface DetailedConfigAccordionProps {
    config: Partial<ExportConfiguration>;
    selectedFieldsCount: number;
}

function DetailedConfigAccordion({ config, selectedFieldsCount }: DetailedConfigAccordionProps) {
    return (
        <Accordion type="multiple" defaultValue={['source', 'fields']}>
            <AccordionItem value="source">
                <AccordionTrigger>Source Configuration</AccordionTrigger>
                <AccordionContent>
                    <SourceQuerySummary sourceQuery={config.sourceQuery} />
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="fields">
                <AccordionTrigger>Selected Fields ({selectedFieldsCount})</AccordionTrigger>
                <AccordionContent>
                    <div className="flex flex-wrap gap-2">
                        {config.fields?.filter(f => f.include).map(f => (
                            <Badge key={f.sourceField} variant="secondary">
                                {f.sourceField}
                                {f.outputName !== f.sourceField && ` -> ${f.outputName}`}
                            </Badge>
                        ))}
                    </div>
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="destination">
                <AccordionTrigger>Destination</AccordionTrigger>
                <AccordionContent>
                    <DestinationSummary destination={config.destination} />
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}

function SourceQuerySummary({ sourceQuery }: { sourceQuery?: QueryConfig }) {
    if (!sourceQuery) return <p className="text-sm text-muted-foreground">All records (default)</p>;

    return (
        <div className="grid grid-cols-2 gap-4 text-sm">
            <SummaryField label="Query type" className="capitalize">{sourceQuery.type}</SummaryField>
            {sourceQuery.limit != null && (
                <SummaryField label="Limit">{sourceQuery.limit.toLocaleString()}</SummaryField>
            )}
            {sourceQuery.orderBy && (
                <SummaryField label="Order by">{sourceQuery.orderBy} {sourceQuery.orderDirection ?? 'ASC'}</SummaryField>
            )}
            {sourceQuery.type === 'graphql' && sourceQuery.customQuery && (
                <div className="col-span-2">
                    <span className="text-muted-foreground">Custom query:</span>
                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">{sourceQuery.customQuery}</pre>
                </div>
            )}
        </div>
    );
}

/**
 * Formats a field value for display in the summary, based on its schema field type.
 * Returns null to skip rendering the field.
 */
function formatFieldValue(value: unknown, fieldType: string): React.ReactNode | null {
    if (value == null || value === '') return null;

    switch (fieldType) {
        case 'boolean':
            return value ? 'Yes' : 'No';
        case 'secret':
            return typeof value === 'string' && value.length > 0 ? 'Configured' : null;
        case 'headers':
            if (value && typeof value === 'object') {
                const count = Object.keys(value).length;
                return count > 0 ? `${count} custom` : null;
            }
            return null;
        default:
            return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
}

function DestinationSummary({ destination }: { destination?: DestinationConfig }) {
    const { schemas } = useDestinationSchemas();

    if (!destination) return <p className="text-sm text-muted-foreground">No destination configured</p>;

    const schema = schemas.find(s => s.type === destination.type);

    // Static message (e.g. DOWNLOAD)
    if (schema?.message) {
        return (
            <div className="grid grid-cols-2 gap-4 text-sm">
                <SummaryField label="Type">{destination.type}</SummaryField>
                <div className="col-span-2">
                    <span className="text-muted-foreground">{schema.message}</span>
                </div>
            </div>
        );
    }

    // Schema-driven summary: read config sub-object and display schema fields
    const configObj = schema?.configKey
        ? (destination as Record<string, unknown>)[schema.configKey] as Record<string, unknown> | undefined
        : undefined;

    return (
        <div className="grid grid-cols-2 gap-4 text-sm">
            <SummaryField label="Type">{destination.type}</SummaryField>

            {schema && configObj ? (
                schema.fields.map(field => {
                    const displayValue = formatFieldValue(configObj[field.key], field.type);
                    if (displayValue == null) return null;
                    return (
                        <SummaryField key={field.key} label={field.label}>
                            {displayValue}
                        </SummaryField>
                    );
                })
            ) : (
                renderGenericConfigFields(destination)
            )}
        </div>
    );
}

/**
 * Fallback renderer for unknown destination types. Finds the first config sub-object
 * matching the `${type.toLowerCase()}Config` convention and displays its fields.
 */
function renderGenericConfigFields(destination: DestinationConfig): React.ReactNode {
    const configKey = `${destination.type.toLowerCase()}Config`;
    const config = (destination as Record<string, unknown>)[configKey] as Record<string, unknown> | undefined;
    if (!config) return null;

    return Object.entries(config)
        .filter(([, v]) => v != null && v !== '' && v !== false)
        .map(([key, value]) => (
            <SummaryField key={key} label={formatFieldLabel(key)}>
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </SummaryField>
        ));
}

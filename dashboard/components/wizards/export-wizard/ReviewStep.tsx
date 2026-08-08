import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
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
import { getNestedValue } from '../../../../shared';
import { useExportEntitySchemas } from '../../../hooks/api/use-export-entity-schemas';
import { useDestinationSchemas } from '../../../hooks/api/use-config-options';
import { formatKey } from '../../../utils/formatters';
import { WizardStepContainer } from '../shared';
import { ConfigurationNameCard, SummaryCard, SummaryCardGrid, SummaryField } from '../../shared/wizard';
import type { ExportConfiguration } from './types';
import type { QueryConfig, DestinationConfig } from '../../../types/wizard';

interface ReviewStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function ReviewStep({ config, updateConfig, errors = {} }: ReviewStepProps) {
    const { t } = useLingui();
    const selectedFieldsCount = config.fields?.filter(f => f.include).length ?? 0;

    return (
        <WizardStepContainer
            title={t`Review & Create`}
            description={t`Review your export configuration before creating`}
        >
            <ConfigurationNameCard
                title={t`Export Configuration`}
                name={config.name ?? ''}
                description={config.description ?? ''}
                onNameChange={name => updateConfig({ name })}
                onDescriptionChange={description => updateConfig({ description })}
                namePlaceholder={t`My Product Export`}
                nameError={errors.name}
                nameHelperText={t`A descriptive name to identify this export configuration`}
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
    const { t } = useLingui();
    const { getEntityName } = useExportEntitySchemas();
    return (
        <SummaryCardGrid columns={4}>
            <SummaryCard
                icon={Database}
                label={t`Source`}
                value={config.sourceEntity ? getEntityName(config.sourceEntity) : undefined}
            />
            <SummaryCard
                icon={Columns}
                label={t`Fields`}
                value={t`${selectedFieldsCount} selected`}
            />
            <SummaryCard
                icon={FileSpreadsheet}
                label={t`Format`}
                value={<span className="uppercase">{config.format?.type}</span>}
            />
            <SummaryCard
                icon={Send}
                label={t`Destination`}
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
    const { t } = useLingui();
    return (
        <Accordion type="multiple" defaultValue={['source', 'fields']}>
            <AccordionItem value="source">
                <AccordionTrigger>
                    <Trans>Source Configuration</Trans>
                </AccordionTrigger>
                <AccordionContent>
                    <SourceQuerySummary sourceQuery={config.sourceQuery} />
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="fields">
                <AccordionTrigger>
                    {t`Selected Fields (${selectedFieldsCount})`}
                </AccordionTrigger>
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
                <AccordionTrigger>
                    <Trans>Destination</Trans>
                </AccordionTrigger>
                <AccordionContent>
                    <DestinationSummary destination={config.destination} />
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}

function SourceQuerySummary({ sourceQuery }: { sourceQuery?: QueryConfig }) {
    const { t } = useLingui();
    if (!sourceQuery) {
        return (
            <p className="text-sm text-muted-foreground">
                <Trans>All records (default)</Trans>
            </p>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-4 text-sm">
            <SummaryField
                label={t`Query type`}
                className="capitalize"
            >
                {sourceQuery.type}
            </SummaryField>
            {sourceQuery.orderBy && (
                <SummaryField label={t`Order by`}>
                    {sourceQuery.orderBy} {sourceQuery.orderDirection ?? 'ASC'}
                </SummaryField>
            )}
        </div>
    );
}

interface FieldValueMessages {
    yes: string;
    no: string;
    configured: string;
    customCount: (count: number) => string;
}

function formatFieldValue(
    value: unknown,
    fieldType: string,
    messages: FieldValueMessages,
): React.ReactNode | null {
    if (value == null || value === '') return null;

    switch (fieldType) {
        case 'boolean':
            return value ? messages.yes : messages.no;
        case 'secret':
            return typeof value === 'string' && value.length > 0
                ? messages.configured
                : null;
        case 'headers':
            if (value && typeof value === 'object') {
                const count = Object.keys(value).length;
                return count > 0
                    ? messages.customCount(count)
                    : null;
            }
            return null;
        default:
            return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
}

function DestinationSummary({ destination }: { destination?: DestinationConfig }) {
    const { t } = useLingui();
    const { schemas } = useDestinationSchemas();

    if (!destination) {
        return (
            <p className="text-sm text-muted-foreground">
                <Trans>No destination configured</Trans>
            </p>
        );
    }

    const schema = schemas.find(s => s.type === destination.type);

    // Static message (e.g. DOWNLOAD)
    if (schema?.message) {
        return (
            <div className="grid grid-cols-2 gap-4 text-sm">
                <SummaryField label={t`Type`}>
                    {destination.type}
                </SummaryField>
                <div className="col-span-2">
                    <span className="text-muted-foreground">{schema.message}</span>
                </div>
            </div>
        );
    }

    // Schema-driven summary: read config sub-object and display schema fields
    const destinationRecord: Record<string, unknown> = { ...destination };
    const configObj = schema?.configKey
        ? destinationRecord[schema.configKey] as Record<string, unknown> | undefined
        : undefined;

    return (
        <div className="grid grid-cols-2 gap-4 text-sm">
            <SummaryField label={t`Type`}>
                {destination.type}
            </SummaryField>

            {schema && configObj ? (
                schema.fields.map(field => {
                    const displayValue = formatFieldValue(
                        getNestedValue(configObj, field.key),
                        field.type,
                        {
                            yes: t`Yes`,
                            no: t`No`,
                            configured: t`Configured`,
                            customCount: count => t`${count} custom`,
                        },
                    );
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
    const destinationRecord: Record<string, unknown> = { ...destination };
    const config = destinationRecord[configKey] as Record<string, unknown> | undefined;
    if (!config) return null;

    return Object.entries(config)
        .filter(([, v]) => v != null && v !== '' && v !== false)
        .map(([key, value]) => (
            <SummaryField key={key} label={formatKey(key)}>
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </SummaryField>
        ));
}

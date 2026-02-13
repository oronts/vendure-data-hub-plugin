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
import { VENDURE_ENTITY_LIST } from '../../../../shared/vendure-schemas';
import { WizardStepContainer } from '../shared';
import { ConfigurationNameCard, SummaryCard, SummaryCardGrid } from '../../shared/wizard';
import { STEP_CONTENT, PLACEHOLDERS } from './constants';
import type { ExportConfiguration } from './types';

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
                namePlaceholder={PLACEHOLDERS.configName}
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
                    <pre className="p-4 bg-muted rounded-lg text-xs overflow-auto">
                        {JSON.stringify(config.sourceQuery, null, 2)}
                    </pre>
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
                    <pre className="p-4 bg-muted rounded-lg text-xs overflow-auto">
                        {JSON.stringify(config.destination, null, 2)}
                    </pre>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}

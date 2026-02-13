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
import { VENDURE_ENTITY_LIST } from '../../../../shared/vendure-schemas';
import { WizardStepContainer } from '../shared';
import { ConfigurationNameCard, SummaryCard, SummaryCardGrid } from '../../shared/wizard';
import { STEP_CONTENT, PLACEHOLDERS } from './constants';
import type { ImportConfiguration } from './types';

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
                namePlaceholder={PLACEHOLDERS.configName}
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
                    <pre className="p-4 bg-muted rounded-lg text-xs overflow-auto">
                        {JSON.stringify(config.source, null, 2)}
                    </pre>
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
                        <div>
                            <span className="text-muted-foreground">Existing records:</span>
                            <span className="ml-2 font-medium">{config.strategies?.existingRecords}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">New records:</span>
                            <span className="ml-2 font-medium">{config.strategies?.newRecords}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Lookup fields:</span>
                            <span className="ml-2 font-medium">{config.strategies?.lookupFields.join(', ')}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Batch size:</span>
                            <span className="ml-2 font-medium">{config.strategies?.batchSize}</span>
                        </div>
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

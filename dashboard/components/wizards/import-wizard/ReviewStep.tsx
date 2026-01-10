/**
 * Import Wizard - Review Step Component
 * Shows a summary and allows final review before creating import
 */

import * as React from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Textarea,
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
import { VENDURE_ENTITY_LIST } from '../../../../vendure-schemas/vendure-entity-schemas';
import type { ImportConfiguration } from './types';
import { FieldError } from '../../../components/common/validation-feedback';

interface ReviewStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function ReviewStep({ config, updateConfig, errors = {} }: ReviewStepProps) {
    const mappedFieldsCount = config.mappings?.filter(m => m.sourceField && m.targetField).length ?? 0;
    const requiredFieldsCount = config.mappings?.filter(m => m.required).length ?? 0;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Review & Create</h2>
                <p className="text-muted-foreground">
                    Review your import configuration before creating
                </p>
            </div>

            {/* Name & Description */}
            <Card>
                <CardHeader>
                    <CardTitle>Import Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Name *</Label>
                        <Input
                            value={config.name ?? ''}
                            onChange={e => updateConfig({ name: e.target.value })}
                            placeholder="My Product Import"
                            className={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
                        />
                        <FieldError error={errors.name} showImmediately />
                        {!errors.name && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                A descriptive name to identify this import configuration
                            </p>
                        )}
                    </div>
                    <div>
                        <Label>Description</Label>
                        <Textarea
                            value={config.description ?? ''}
                            onChange={e => updateConfig({ description: e.target.value })}
                            placeholder="Optional description..."
                            rows={2}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Summary */}
            <SummaryCards
                config={config}
                mappedFieldsCount={mappedFieldsCount}
                requiredFieldsCount={requiredFieldsCount}
            />

            {/* Detailed Configuration */}
            <DetailedConfigAccordion
                config={config}
                mappedFieldsCount={mappedFieldsCount}
            />
        </div>
    );
}

interface SummaryCardsProps {
    config: Partial<ImportConfiguration>;
    mappedFieldsCount: number;
    requiredFieldsCount: number;
}

function SummaryCards({ config, mappedFieldsCount, requiredFieldsCount }: SummaryCardsProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="p-4 text-center">
                    <Database className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="font-medium">Source</div>
                    <div className="text-sm text-muted-foreground capitalize">
                        {config.source?.type}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 text-center">
                    <Table className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="font-medium">Target</div>
                    <div className="text-sm text-muted-foreground">
                        {VENDURE_ENTITY_LIST.find(e => e.code === config.targetEntity)?.name}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 text-center">
                    <Columns className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="font-medium">Mappings</div>
                    <div className="text-sm text-muted-foreground">
                        {mappedFieldsCount} fields ({requiredFieldsCount} required)
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 text-center">
                    <Clock className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="font-medium">Trigger</div>
                    <div className="text-sm text-muted-foreground capitalize">
                        {config.trigger?.type}
                    </div>
                </CardContent>
            </Card>
        </div>
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
                        {config.mappings?.filter(m => m.sourceField && m.targetField).map((m, i) => (
                            <div key={i} className="flex items-center gap-3 p-2 bg-muted rounded">
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

export default ReviewStep;

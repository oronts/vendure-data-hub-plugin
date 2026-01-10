/**
 * Export Wizard - Review Step Component
 * Shows summary and allows final configuration
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
    Columns,
    FileSpreadsheet,
    Send,
} from 'lucide-react';
import { VENDURE_ENTITY_LIST } from '../../../../vendure-schemas/vendure-entity-schemas';
import type { ExportConfiguration } from './types';

interface ReviewStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

export function ReviewStep({ config, updateConfig }: ReviewStepProps) {
    const selectedFieldsCount = config.fields?.filter(f => f.include).length ?? 0;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Review & Create</h2>
                <p className="text-muted-foreground">
                    Review your export configuration before creating
                </p>
            </div>

            {/* Name & Description */}
            <ConfigurationCard config={config} updateConfig={updateConfig} />

            {/* Summary */}
            <SummaryCards config={config} selectedFieldsCount={selectedFieldsCount} />

            {/* Detailed Configuration */}
            <DetailedConfigAccordion config={config} selectedFieldsCount={selectedFieldsCount} />
        </div>
    );
}

interface ConfigurationCardProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function ConfigurationCard({ config, updateConfig }: ConfigurationCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Export Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label>Name *</Label>
                    <Input
                        value={config.name ?? ''}
                        onChange={e => updateConfig({ name: e.target.value })}
                        placeholder="My Product Export"
                    />
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
    );
}

interface SummaryCardsProps {
    config: Partial<ExportConfiguration>;
    selectedFieldsCount: number;
}

function SummaryCards({ config, selectedFieldsCount }: SummaryCardsProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="p-4 text-center">
                    <Database className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="font-medium">Source</div>
                    <div className="text-sm text-muted-foreground">
                        {VENDURE_ENTITY_LIST.find(e => e.code === config.sourceEntity)?.name}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 text-center">
                    <Columns className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="font-medium">Fields</div>
                    <div className="text-sm text-muted-foreground">
                        {selectedFieldsCount} selected
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 text-center">
                    <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="font-medium">Format</div>
                    <div className="text-sm text-muted-foreground uppercase">
                        {config.format?.type}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 text-center">
                    <Send className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="font-medium">Destination</div>
                    <div className="text-sm text-muted-foreground capitalize">
                        {config.destination?.type}
                    </div>
                </CardContent>
            </Card>
        </div>
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

export default ReviewStep;

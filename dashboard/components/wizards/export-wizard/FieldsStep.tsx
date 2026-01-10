/**
 * Export Wizard - Fields Step Component
 * Handles field selection and output naming
 */

import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    Input,
    Badge,
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    ScrollArea,
} from '@vendure/dashboard';
import type { ExportConfiguration, ExportField } from './types';

interface FieldsStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

export function FieldsStep({ config, updateConfig }: FieldsStepProps) {
    const fields = config.fields ?? [];

    const toggleField = (index: number) => {
        const newFields = [...fields];
        newFields[index] = { ...newFields[index], include: !newFields[index].include };
        updateConfig({ fields: newFields });
    };

    const updateField = (index: number, updates: Partial<ExportField>) => {
        const newFields = [...fields];
        newFields[index] = { ...newFields[index], ...updates };
        updateConfig({ fields: newFields });
    };

    const selectAll = () => {
        updateConfig({
            fields: fields.map(f => ({ ...f, include: true })),
        });
    };

    const deselectAll = () => {
        updateConfig({
            fields: fields.map(f => ({ ...f, include: false })),
        });
    };

    const selectedCount = fields.filter(f => f.include).length;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold mb-2">Select Fields</h2>
                    <p className="text-muted-foreground">
                        Choose which fields to include in the export
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="secondary">{selectedCount} of {fields.length} selected</Badge>
                    <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
                    <Button variant="outline" size="sm" onClick={deselectAll}>Deselect All</Button>
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="grid grid-cols-12 gap-4 p-4 bg-muted font-medium text-sm">
                        <div className="col-span-1">Include</div>
                        <div className="col-span-4">Source Field</div>
                        <div className="col-span-4">Output Name</div>
                        <div className="col-span-3">Transform</div>
                    </div>

                    <ScrollArea className="h-[500px]">
                        <div className="divide-y">
                            {fields.map((field, index) => (
                                <FieldRow
                                    key={field.sourceField}
                                    field={field}
                                    index={index}
                                    onToggle={() => toggleField(index)}
                                    onUpdate={(updates) => updateField(index, updates)}
                                />
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}

interface FieldRowProps {
    field: ExportField;
    index: number;
    onToggle: () => void;
    onUpdate: (updates: Partial<ExportField>) => void;
}

function FieldRow({ field, index, onToggle, onUpdate }: FieldRowProps) {
    return (
        <div
            className={`grid grid-cols-12 gap-4 p-4 items-center ${
                !field.include ? 'opacity-50' : ''
            }`}
        >
            <div className="col-span-1">
                <Switch
                    checked={field.include}
                    onCheckedChange={onToggle}
                />
            </div>

            <div className="col-span-4">
                <code className="text-sm font-mono">{field.sourceField}</code>
            </div>

            <div className="col-span-4">
                <Input
                    value={field.outputName}
                    onChange={e => onUpdate({ outputName: e.target.value })}
                    disabled={!field.include}
                    className="font-mono"
                />
            </div>

            <div className="col-span-3">
                <Select
                    value={field.transformation ?? '__none__'}
                    onValueChange={transformation => onUpdate({
                        transformation: transformation === '__none__' ? undefined : transformation,
                    })}
                    disabled={!field.include}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        <SelectItem value="uppercase">Uppercase</SelectItem>
                        <SelectItem value="lowercase">Lowercase</SelectItem>
                        <SelectItem value="trim">Trim</SelectItem>
                        <SelectItem value="date-format">Date Format</SelectItem>
                        <SelectItem value="number-format">Number Format</SelectItem>
                        <SelectItem value="currency">Currency</SelectItem>
                        <SelectItem value="boolean-yn">Boolean (Y/N)</SelectItem>
                        <SelectItem value="html-strip">Strip HTML</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

export default FieldsStep;

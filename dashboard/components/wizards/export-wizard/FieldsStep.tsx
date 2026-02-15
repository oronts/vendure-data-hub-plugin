import { useCallback } from 'react';
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
import { WizardStepContainer } from '../shared';
import { STEP_CONTENT } from './Constants';
import { COMPONENT_HEIGHTS, SENTINEL_VALUES } from '../../../constants';
import type { ExportConfiguration, ExportField } from './Types';

interface FieldsStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function FieldsStep({ config, updateConfig, errors = {} }: FieldsStepProps) {
    const fields = config.fields ?? [];

    const toggleField = useCallback((index: number) => {
        const currentFields = config.fields ?? [];
        const newFields = [...currentFields];
        newFields[index] = { ...newFields[index], include: !newFields[index].include };
        updateConfig({ fields: newFields });
    }, [config.fields, updateConfig]);

    const updateField = useCallback((index: number, updates: Partial<ExportField>) => {
        const currentFields = config.fields ?? [];
        const newFields = [...currentFields];
        newFields[index] = { ...newFields[index], ...updates };
        updateConfig({ fields: newFields });
    }, [config.fields, updateConfig]);

    const selectAll = useCallback(() => {
        const currentFields = config.fields ?? [];
        updateConfig({
            fields: currentFields.map(f => ({ ...f, include: true })),
        });
    }, [config.fields, updateConfig]);

    const deselectAll = useCallback(() => {
        const currentFields = config.fields ?? [];
        updateConfig({
            fields: currentFields.map(f => ({ ...f, include: false })),
        });
    }, [config.fields, updateConfig]);

    const selectedCount = fields.filter(f => f.include).length;

    return (
        <WizardStepContainer
            title={STEP_CONTENT.fields.title}
            description={STEP_CONTENT.fields.description}
        >
            <div className="flex items-center justify-end gap-2">
                <Badge variant="secondary">{selectedCount} of {fields.length} selected</Badge>
                <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>Deselect All</Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="grid grid-cols-12 gap-4 p-4 bg-muted font-medium text-sm">
                        <div className="col-span-1">Include</div>
                        <div className="col-span-4">Source Field</div>
                        <div className="col-span-4">Output Name</div>
                        <div className="col-span-3">Transform</div>
                    </div>

                    <ScrollArea className={COMPONENT_HEIGHTS.WIZARD_PANE_MD}>
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
        </WizardStepContainer>
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
                    value={field.transformation ?? SENTINEL_VALUES.NONE}
                    onValueChange={transformation => onUpdate({
                        transformation: transformation === SENTINEL_VALUES.NONE ? undefined : transformation,
                    })}
                    disabled={!field.include}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={SENTINEL_VALUES.NONE}>None</SelectItem>
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

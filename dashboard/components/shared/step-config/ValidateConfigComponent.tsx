import * as React from 'react';
import { useCallback } from 'react';
import {
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Input,
    Button,
} from '@vendure/dashboard';
import { Plus, Trash2 } from 'lucide-react';
import { VALIDATION_MODES, ERROR_HANDLING_MODES } from '../../../constants/step-configs';

interface ValidationRule {
    type: string;
    spec: {
        field: string;
        required?: boolean;
        min?: number;
        max?: number;
        pattern?: string;
        error?: string;
    };
}

export interface ValidateConfigComponentProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
    readonly showErrorHandling?: boolean;
    readonly showValidationMode?: boolean;
    readonly showRulesEditor?: boolean;
}

const RULE_TYPES = [
    { value: 'required', label: 'Required' },
    { value: 'range', label: 'Number Range' },
    { value: 'pattern', label: 'Regex Pattern' },
];

export function ValidateConfigComponent({
    config,
    onChange,
    showErrorHandling = true,
    showValidationMode = true,
    showRulesEditor = true,
}: ValidateConfigComponentProps) {
    const errorHandlingMode = (config.errorHandlingMode as string) || 'fail-fast';
    const validationMode = (config.validationMode as string) || 'strict';
    const rules = (config.rules as ValidationRule[]) || [];

    const updateField = useCallback((key: string, value: unknown) => {
        onChange({ ...config, [key]: value });
    }, [config, onChange]);

    const addRule = useCallback(() => {
        const newRules = [...rules, { type: 'business', spec: { field: '', required: true } }];
        onChange({ ...config, rules: newRules });
    }, [config, rules, onChange]);

    const updateRule = useCallback((index: number, spec: ValidationRule['spec']) => {
        const newRules = [...rules];
        newRules[index] = { ...newRules[index], spec };
        onChange({ ...config, rules: newRules });
    }, [config, rules, onChange]);

    const removeRule = useCallback((index: number) => {
        const newRules = rules.filter((_, i) => i !== index);
        onChange({ ...config, rules: newRules });
    }, [config, rules, onChange]);

    return (
        <div className="space-y-4">
            {showValidationMode && (
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Validation Mode</Label>
                    <Select
                        value={validationMode}
                        onValueChange={(v) => updateField('validationMode', v)}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {VALIDATION_MODES.map((mode) => (
                                <SelectItem key={mode.value} value={mode.value}>
                                    {mode.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        How to handle records that fail validation rules
                    </p>
                </div>
            )}

            {showErrorHandling && (
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Error Handling</Label>
                    <Select
                        value={errorHandlingMode}
                        onValueChange={(v) => updateField('errorHandlingMode', v)}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {ERROR_HANDLING_MODES.map((mode) => (
                                <SelectItem key={mode.value} value={mode.value}>
                                    {mode.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        When to stop processing: immediately on first error or after collecting all errors
                    </p>
                </div>
            )}

            {showRulesEditor && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Validation Rules</Label>
                        <Button variant="outline" size="sm" onClick={addRule}>
                            <Plus className="h-3 w-3 mr-1" />
                            Add Rule
                        </Button>
                    </div>

                    {rules.length === 0 && (
                        <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
                            No validation rules defined. Add rules to validate record fields.
                        </p>
                    )}

                    {rules.map((rule, index) => (
                        <div key={index} className="flex items-start gap-2 p-3 border rounded-md bg-muted/30">
                            <div className="flex-1 space-y-2">
                                <div className="flex gap-2">
                                    <Input
                                        value={rule.spec.field || ''}
                                        onChange={(e) => updateRule(index, { ...rule.spec, field: e.target.value })}
                                        placeholder="Field name (e.g., sku, price)"
                                        className="flex-1"
                                    />
                                    <Select
                                        value={rule.spec.required ? 'required' : rule.spec.min !== undefined ? 'range' : rule.spec.pattern ? 'pattern' : 'required'}
                                        onValueChange={(v) => {
                                            if (v === 'required') {
                                                updateRule(index, { field: rule.spec.field, required: true });
                                            } else if (v === 'range') {
                                                updateRule(index, { field: rule.spec.field, min: 0 });
                                            } else if (v === 'pattern') {
                                                updateRule(index, { field: rule.spec.field, pattern: '' });
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="w-32">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {RULE_TYPES.map((rt) => (
                                                <SelectItem key={rt.value} value={rt.value}>
                                                    {rt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {rule.spec.min !== undefined && (
                                    <div className="flex gap-2">
                                        <Input
                                            type="number"
                                            value={rule.spec.min ?? ''}
                                            onChange={(e) => updateRule(index, { ...rule.spec, min: parseFloat(e.target.value) || 0 })}
                                            placeholder="Min"
                                            className="w-24"
                                        />
                                        <Input
                                            type="number"
                                            value={rule.spec.max ?? ''}
                                            onChange={(e) => updateRule(index, { ...rule.spec, max: parseFloat(e.target.value) || undefined })}
                                            placeholder="Max"
                                            className="w-24"
                                        />
                                    </div>
                                )}
                                {rule.spec.pattern !== undefined && (
                                    <Input
                                        value={rule.spec.pattern || ''}
                                        onChange={(e) => updateRule(index, { ...rule.spec, pattern: e.target.value })}
                                        placeholder="Regex pattern (e.g., ^[A-Z]{3}-\\d+$)"
                                    />
                                )}
                                <Input
                                    value={rule.spec.error || ''}
                                    onChange={(e) => updateRule(index, { ...rule.spec, error: e.target.value })}
                                    placeholder="Error message (optional)"
                                    className="text-xs"
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeRule(index)}
                                className="text-destructive hover:text-destructive"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

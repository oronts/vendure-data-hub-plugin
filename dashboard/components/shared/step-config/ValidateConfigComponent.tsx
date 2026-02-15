import * as React from 'react';
import { useCallback, useMemo, useRef, memo } from 'react';
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
import { VALIDATION_MODES, ERROR_HANDLING_MODES } from '../../../constants/StepConfigs';
import { PLACEHOLDERS } from '../../../constants/Placeholders';

interface ValidationRule {
    id?: string;
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

interface ValidationRuleWithId extends ValidationRule {
    id: string;
}

let validationRuleIdCounter = 0;
function generateValidationRuleId(): string {
    return `validation-rule-${Date.now()}-${++validationRuleIdCounter}`;
}

/**
 * Hook to ensure all rules have stable IDs.
 * Assigns IDs to rules that don't have them and maintains stability across renders.
 */
function useRulesWithStableIds(rules: ValidationRule[]): ValidationRuleWithId[] {
    const idMapRef = useRef<Map<number, string>>(new Map());

    return useMemo(() => {
        const newIdMap = new Map<number, string>();

        const rulesWithIds = rules.map((rule, index) => {
            // If rule already has an ID, use it
            if (rule.id) {
                newIdMap.set(index, rule.id);
                return rule as ValidationRuleWithId;
            }

            // Try to reuse ID from previous render at same index
            const existingId = idMapRef.current.get(index);
            if (existingId) {
                newIdMap.set(index, existingId);
                return { ...rule, id: existingId } as ValidationRuleWithId;
            }

            // Generate new ID
            const newId = generateValidationRuleId();
            newIdMap.set(index, newId);
            return { ...rule, id: newId } as ValidationRuleWithId;
        });

        idMapRef.current = newIdMap;
        return rulesWithIds;
    }, [rules]);
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
    const errorHandlingMode = (config.errorHandlingMode as string) || 'FAIL_FAST';
    const validationMode = (config.validationMode as string) || 'STRICT';
    const rawRules = (config.rules as ValidationRule[]) || [];
    const rules = useRulesWithStableIds(rawRules);

    const updateField = useCallback((key: string, value: unknown) => {
        onChange({ ...config, [key]: value });
    }, [config, onChange]);

    const addRule = useCallback(() => {
        const newRule: ValidationRuleWithId = {
            id: generateValidationRuleId(),
            type: 'business',
            spec: { field: '', required: true }
        };
        const newRules = [...rawRules, newRule];
        onChange({ ...config, rules: newRules });
    }, [config, rawRules, onChange]);

    const updateRule = useCallback((index: number, spec: ValidationRule['spec']) => {
        const newRules = [...rawRules];
        newRules[index] = { ...newRules[index], spec };
        onChange({ ...config, rules: newRules });
    }, [config, rawRules, onChange]);

    const removeRule = useCallback((index: number) => {
        const newRules = rawRules.filter((_, i) => i !== index);
        onChange({ ...config, rules: newRules });
    }, [config, rawRules, onChange]);

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
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={addRule}
                            aria-label="Add validation rule"
                            data-testid="datahub-validate-add-rule-btn"
                        >
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
                        <ValidationRuleRow
                            key={rule.id}
                            rule={rule}
                            index={index}
                            updateRule={updateRule}
                            removeRule={removeRule}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface ValidationRuleRowProps {
    rule: ValidationRuleWithId;
    index: number;
    updateRule: (index: number, spec: ValidationRule['spec']) => void;
    removeRule: (index: number) => void;
}

const ValidationRuleRow = memo(function ValidationRuleRow({
    rule,
    index,
    updateRule,
    removeRule,
}: ValidationRuleRowProps) {
    const handleFieldChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateRule(index, { ...rule.spec, field: e.target.value });
    }, [index, rule.spec, updateRule]);

    const handleTypeChange = useCallback((v: string) => {
        if (v === 'required') {
            updateRule(index, { field: rule.spec.field, required: true });
        } else if (v === 'range') {
            updateRule(index, { field: rule.spec.field, min: 0 });
        } else if (v === 'pattern') {
            updateRule(index, { field: rule.spec.field, pattern: '' });
        }
    }, [index, rule.spec.field, updateRule]);

    const handleMinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateRule(index, { ...rule.spec, min: parseFloat(e.target.value) || 0 });
    }, [index, rule.spec, updateRule]);

    const handleMaxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateRule(index, { ...rule.spec, max: parseFloat(e.target.value) || undefined });
    }, [index, rule.spec, updateRule]);

    const handlePatternChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateRule(index, { ...rule.spec, pattern: e.target.value });
    }, [index, rule.spec, updateRule]);

    const handleErrorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateRule(index, { ...rule.spec, error: e.target.value });
    }, [index, rule.spec, updateRule]);

    const handleRemove = useCallback(() => {
        removeRule(index);
    }, [index, removeRule]);

    const currentType = rule.spec.required ? 'required' : rule.spec.min !== undefined ? 'range' : rule.spec.pattern ? 'pattern' : 'required';

    return (
        <div className="flex items-start gap-2 p-3 border rounded-md bg-muted/30" data-testid={`datahub-validate-rule-row-${index}`}>
            <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                    <Input
                        value={rule.spec.field || ''}
                        onChange={handleFieldChange}
                        placeholder={PLACEHOLDERS.FIELD_NAME}
                        className="flex-1"
                    />
                    <Select
                        value={currentType}
                        onValueChange={handleTypeChange}
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
                            onChange={handleMinChange}
                            placeholder="Min"
                            className="w-24"
                        />
                        <Input
                            type="number"
                            value={rule.spec.max ?? ''}
                            onChange={handleMaxChange}
                            placeholder="Max"
                            className="w-24"
                        />
                    </div>
                )}
                {rule.spec.pattern !== undefined && (
                    <Input
                        value={rule.spec.pattern || ''}
                        onChange={handlePatternChange}
                        placeholder={PLACEHOLDERS.REGEX_PATTERN}
                    />
                )}
                <Input
                    value={rule.spec.error || ''}
                    onChange={handleErrorChange}
                    placeholder={PLACEHOLDERS.ERROR_MESSAGE}
                    className="text-xs"
                />
            </div>
            <Button
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                className="text-destructive hover:text-destructive"
                aria-label={`Delete validation rule for ${rule.spec.field || 'field'}`}
                data-testid={`datahub-validate-rule-delete-${index}-btn`}
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
});

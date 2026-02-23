import * as React from 'react';
import { useCallback, useMemo, memo } from 'react';
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
import { PLACEHOLDERS } from '../../../constants';
import { useValidationRuleSchemas, useOptionValues, type TypedOptionValue, type ConnectionSchemaField } from '../../../hooks/api/use-config-options';
import { useStableIndexIds } from '../../../hooks/use-stable-keys';

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

const FALLBACK_RULE_TYPE = 'REQUIRED';

function detectRuleType(spec: ValidationRule['spec'], schemas: TypedOptionValue[]): string {
    // Check which schema's defaultValues keys match the spec
    for (const schema of schemas) {
        if (!schema.defaultValues) continue;
        const keys = Object.keys(schema.defaultValues);
        if (keys.some(k => spec[k as keyof typeof spec] !== undefined)) {
            return schema.value;
        }
    }
    // Check if any field keys from schemas exist in spec
    for (const schema of schemas) {
        if (schema.fields.some(f => spec[f.key as keyof typeof spec] !== undefined)) {
            return schema.value;
        }
    }
    return schemas[0]?.value ?? FALLBACK_RULE_TYPE;
}

let validationRuleIdCounter = 0;
function generateValidationRuleId(): string {
    return `validation-rule-${Date.now()}-${++validationRuleIdCounter}`;
}

export interface ValidateConfigComponentProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
    readonly showErrorHandling?: boolean;
    readonly showValidationMode?: boolean;
    readonly showRulesEditor?: boolean;
}

export function ValidateConfigComponent({
    config,
    onChange,
    showErrorHandling = true,
    showValidationMode = true,
    showRulesEditor = true,
}: ValidateConfigComponentProps) {
    const { schemas: ruleTypeSchemas } = useValidationRuleSchemas();
    const ruleTypes = ruleTypeSchemas;
    const { options: validationModes } = useOptionValues('validationModes');
    const errorHandlingOptions = validationModes;
    const errorHandlingMode = (config.errorHandlingMode as string) || 'FAIL_FAST';
    const validationMode = (config.validationMode as string) || 'STRICT';
    const rawRules = (config.rules as ValidationRule[]) || [];
    const stableIds = useStableIndexIds(rawRules, 'validation-rule');
    const rules = useMemo<ValidationRuleWithId[]>(() =>
        rawRules.map((rule, index) => ({
            ...rule,
            id: rule.id || stableIds[index],
        })),
    [rawRules, stableIds]);

    const updateField = useCallback((key: string, value: unknown) => {
        onChange({ ...config, [key]: value });
    }, [config, onChange]);

    const addRule = useCallback(() => {
        const defaultRuleType = ruleTypeSchemas[0]?.value ?? FALLBACK_RULE_TYPE;
        const schema = ruleTypeSchemas.find(s => s.value === defaultRuleType);
        const defaultSpec = schema?.defaultValues ?? { required: true };
        const newRule: ValidationRuleWithId = {
            id: generateValidationRuleId(),
            type: 'business',
            spec: { field: '', ...defaultSpec } as ValidationRule['spec'],
        };
        const newRules = [...rawRules, newRule];
        onChange({ ...config, rules: newRules });
    }, [config, rawRules, onChange, ruleTypeSchemas]);

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
                            {validationModes.map((mode) => (
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
                            {errorHandlingOptions.map((mode) => (
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
                            ruleTypes={ruleTypes}
                            ruleTypeSchemas={ruleTypeSchemas}
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
    ruleTypes: TypedOptionValue[];
    ruleTypeSchemas: TypedOptionValue[];
    updateRule: (index: number, spec: ValidationRule['spec']) => void;
    removeRule: (index: number) => void;
}

const ValidationRuleRow = memo(function ValidationRuleRow({
    rule,
    index,
    ruleTypes,
    ruleTypeSchemas,
    updateRule,
    removeRule,
}: ValidationRuleRowProps) {
    const handleFieldChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateRule(index, { ...rule.spec, field: e.target.value });
    }, [index, rule.spec, updateRule]);

    const handleTypeChange = useCallback((v: string) => {
        const schema = ruleTypeSchemas.find(s => s.value === v);
        if (schema) {
            const defaultSpec = schema.defaultValues ?? {};
            updateRule(index, { field: rule.spec.field, ...defaultSpec } as ValidationRule['spec']);
        }
    }, [index, rule.spec.field, updateRule, ruleTypeSchemas]);

    const handleErrorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateRule(index, { ...rule.spec, error: e.target.value });
    }, [index, rule.spec, updateRule]);

    const handleRemove = useCallback(() => {
        removeRule(index);
    }, [index, removeRule]);

    const currentType = detectRuleType(rule.spec, ruleTypeSchemas);
    const currentRuleSchema = ruleTypeSchemas.find(s => s.value === currentType);

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
                            {ruleTypes.map((rt) => (
                                <SelectItem key={rt.value} value={rt.value}>
                                    {rt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {currentRuleSchema && currentRuleSchema.fields.length > 0 && (
                    <div className="flex gap-2">
                        {currentRuleSchema.fields.map(field => (
                            <SchemaRuleField
                                key={field.key}
                                field={field}
                                spec={rule.spec}
                                index={index}
                                updateRule={updateRule}
                            />
                        ))}
                    </div>
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

function SchemaRuleField({
    field,
    spec,
    index,
    updateRule,
}: {
    field: ConnectionSchemaField;
    spec: ValidationRule['spec'];
    index: number;
    updateRule: (index: number, spec: ValidationRule['spec']) => void;
}) {
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = field.type === 'number'
            ? (isNaN(parseFloat(e.target.value)) ? undefined : parseFloat(e.target.value))
            : e.target.value;
        updateRule(index, { ...spec, [field.key]: value });
    }, [index, spec, updateRule, field.key, field.type]);

    return (
        <Input
            type={field.type === 'number' ? 'number' : 'text'}
            value={spec[field.key as keyof typeof spec] ?? ''}
            onChange={handleChange}
            placeholder={field.placeholder ?? field.label}
            className={field.type === 'number' ? 'w-24' : undefined}
        />
    );
}

import * as React from 'react';
import { useCallback, useMemo, memo } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Input,
    Button,
    Switch,
    Textarea,
} from '@vendure/dashboard';
import { Plus, Trash2 } from 'lucide-react';
import { useValidationRuleSchemas, useOptionValues, type TypedOptionValue } from '../../../hooks/api/use-config-options';
import { useStableIndexIds } from '../../../hooks/use-stable-keys';
import {
    applyValidationRulePreset,
    formatValidationEnum,
    getUnsupportedValidationRuleFields,
    isValidationValueType,
    parseValidationEnum,
    setValidationRuleConstraint,
    VALIDATION_VALUE_TYPES,
    type ValidationConstraintKey,
    type ValidationRule,
    type ValidationRuleSpec,
} from './validation-rule-contract';

interface ValidationRuleWithId extends ValidationRule {
    id: string;
}

const FALLBACK_RULE_TYPE = 'REQUIRED';
const ANY_VALUE_TYPE = 'ANY';

let validationRuleIdCounter = 0;
function generateValidationRuleId(): string {
    return `validation-rule-${Date.now()}-${++validationRuleIdCounter}`;
}

export interface ValidateConfigComponentProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
    readonly showErrorHandling?: boolean;
    readonly showRulesEditor?: boolean;
}

export function ValidateConfigComponent({
    config,
    onChange,
    showErrorHandling = true,
    showRulesEditor = true,
}: ValidateConfigComponentProps) {
    const { t } = useLingui();
    const { schemas: ruleTypeSchemas } = useValidationRuleSchemas();
    const { options: validationModes } = useOptionValues('validationModes');
    const errorHandlingMode = (config.errorHandlingMode as string) || '';
    const errorHandlingId = React.useId();
    const rawRules = useMemo(
        () => (config.rules as ValidationRule[]) || [],
        [config.rules],
    );
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
            spec: applyValidationRulePreset({ field: '' }, defaultSpec),
        };
        const newRules = [...rawRules, newRule];
        onChange({ ...config, rules: newRules });
    }, [config, rawRules, onChange, ruleTypeSchemas]);

    const updateRule = useCallback((index: number, spec: ValidationRuleSpec) => {
        const newRules = [...rawRules];
        newRules[index] = { ...newRules[index], type: 'business', spec };
        onChange({ ...config, rules: newRules });
    }, [config, rawRules, onChange]);

    const removeRule = useCallback((index: number) => {
        const newRules = rawRules.filter((_, i) => i !== index);
        onChange({ ...config, rules: newRules });
    }, [config, rawRules, onChange]);

    return (
        <div className="space-y-4">
            {showErrorHandling && (
                <div className="space-y-2">
                    <Label htmlFor={errorHandlingId} className="text-sm font-medium">
                        <Trans>Error handling</Trans>
                    </Label>
                    <Select
                        value={errorHandlingMode}
                        onValueChange={(v) => updateField('errorHandlingMode', v)}
                    >
                        <SelectTrigger id={errorHandlingId} className="w-full">
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
                        <Trans>Choose whether processing stops at the first error or after all errors are collected.</Trans>
                    </p>
                </div>
            )}

            {showRulesEditor && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">
                            <Trans>Validation rules</Trans>
                        </h4>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={addRule}
                            aria-label={t`Add validation rule`}
                            data-testid="datahub-validate-add-rule-btn"
                        >
                            <Plus className="h-3 w-3 mr-1" />
                            <Trans>Add rule</Trans>
                        </Button>
                    </div>

                    {rules.length === 0 && (
                        <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
                            <Trans>No validation rules defined. Add rules to validate record fields.</Trans>
                        </p>
                    )}

                    {rules.map((rule, index) => (
                        <ValidationRuleRow
                            key={rule.id}
                            rule={rule}
                            index={index}
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
    ruleTypeSchemas: TypedOptionValue[];
    updateRule: (index: number, spec: ValidationRuleSpec) => void;
    removeRule: (index: number) => void;
}

const ValidationRuleRow = memo(function ValidationRuleRow({
    rule,
    index,
    ruleTypeSchemas,
    updateRule,
    removeRule,
}: ValidationRuleRowProps) {
    const { t } = useLingui();
    const fieldId = React.useId();
    const presetId = React.useId();
    const valueTypeId = React.useId();
    const requiredId = React.useId();
    const patternId = React.useId();
    const errorId = React.useId();
    const handleFieldChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateRule(index, { ...rule.spec, field: e.target.value });
    }, [index, rule.spec, updateRule]);

    const handlePresetChange = useCallback((v: string) => {
        const schema = ruleTypeSchemas.find(s => s.value === v);
        if (schema) {
            updateRule(index, applyValidationRulePreset(
                rule.spec,
                schema.defaultValues ?? {},
            ));
        }
    }, [index, rule.spec, updateRule, ruleTypeSchemas]);

    const updateConstraint = useCallback((key: ValidationConstraintKey, value: unknown) => {
        updateRule(index, setValidationRuleConstraint(rule.spec, key, value));
    }, [index, rule.spec, updateRule]);

    const handleRemove = useCallback(() => {
        removeRule(index);
    }, [index, removeRule]);

    const unsupportedFields = getUnsupportedValidationRuleFields(rule.spec);
    const hasUnsupportedRuleType = rule.type !== 'business';
    const hasUnsupportedValueType = rule.spec.type !== undefined
        && !isValidationValueType(rule.spec.type);
    const hasInvalidEnum = rule.spec.enum !== undefined
        && !Array.isArray(rule.spec.enum);

    return (
        <div className="flex items-start gap-2 p-3 border rounded-md bg-muted/30" data-testid={`datahub-validate-rule-row-${index}`}>
            <div className="min-w-0 flex-1 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                        <Label htmlFor={fieldId}><Trans>Field</Trans></Label>
                        <Input
                            id={fieldId}
                            value={rule.spec.field || ''}
                            onChange={handleFieldChange}
                            placeholder={t`Field name`}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor={valueTypeId}><Trans>Value type</Trans></Label>
                        <Select
                            value={isValidationValueType(rule.spec.type)
                                ? rule.spec.type
                                : ANY_VALUE_TYPE}
                            onValueChange={value => updateConstraint(
                                'type',
                                value === ANY_VALUE_TYPE ? undefined : value,
                            )}
                        >
                            <SelectTrigger id={valueTypeId}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ANY_VALUE_TYPE}><Trans>Any type</Trans></SelectItem>
                                {VALIDATION_VALUE_TYPES.map(valueType => (
                                    <SelectItem key={valueType} value={valueType}>
                                        {valueType === 'string'
                                            ? <Trans>String</Trans>
                                            : valueType === 'number'
                                                ? <Trans>Number</Trans>
                                                : <Trans>Boolean</Trans>}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {ruleTypeSchemas.length > 0 && (
                        <div className="space-y-1">
                            <Label htmlFor={presetId}><Trans>Apply preset</Trans></Label>
                            <Select value="" onValueChange={handlePresetChange}>
                                <SelectTrigger id={presetId}>
                                    <SelectValue placeholder={t`Choose a preset`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {ruleTypeSchemas.map(schema => (
                                        <SelectItem key={schema.value} value={schema.value}>
                                            {schema.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Switch
                        id={requiredId}
                        checked={rule.spec.required === true}
                        onCheckedChange={checked => updateConstraint(
                            'required',
                            checked ? true : undefined,
                        )}
                    />
                    <Label htmlFor={requiredId}><Trans>Required</Trans></Label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <NumberConstraintField
                        label={t`Minimum value`}
                        value={rule.spec.min}
                        onChange={value => updateConstraint('min', value)}
                    />
                    <NumberConstraintField
                        label={t`Maximum value`}
                        value={rule.spec.max}
                        onChange={value => updateConstraint('max', value)}
                    />
                    <NumberConstraintField
                        label={t`Minimum length`}
                        value={rule.spec.minLength}
                        onChange={value => updateConstraint('minLength', value)}
                        integer
                    />
                    <NumberConstraintField
                        label={t`Maximum length`}
                        value={rule.spec.maxLength}
                        onChange={value => updateConstraint('maxLength', value)}
                        integer
                    />
                </div>

                <div className="space-y-1">
                    <Label htmlFor={patternId}><Trans>Pattern</Trans></Label>
                    <Input
                        id={patternId}
                        value={typeof rule.spec.pattern === 'string' ? rule.spec.pattern : ''}
                        onChange={event => updateConstraint('pattern', event.target.value)}
                        placeholder="^[A-Z0-9]+$"
                    />
                    <p className="text-xs text-muted-foreground">
                        <Trans>Regular expression applied to string values.</Trans>
                    </p>
                </div>

                <EnumConstraintField
                    value={rule.spec.enum}
                    onChange={value => updateConstraint('enum', value)}
                />

                <div className="space-y-1">
                    <Label htmlFor={errorId}><Trans>Error message</Trans></Label>
                    <Input
                        id={errorId}
                        value={typeof rule.spec.error === 'string' ? rule.spec.error : ''}
                        onChange={event => updateConstraint('error', event.target.value)}
                        placeholder={t`Use the generated validation message`}
                    />
                </div>

                {(
                    hasUnsupportedRuleType
                    || unsupportedFields.length > 0
                    || hasUnsupportedValueType
                    || hasInvalidEnum
                ) && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
                        {hasUnsupportedRuleType && (
                            <p><Trans>This rule type is unsupported and prevents pipeline publication. Editing the rule converts it to a business rule.</Trans></p>
                        )}
                        {unsupportedFields.length > 0 && (
                            <p>
                                <Trans>These unsupported fields prevent pipeline publication:</Trans>{' '}
                                {unsupportedFields.join(', ')}
                            </p>
                        )}
                        {hasUnsupportedValueType && (
                            <p><Trans>The configured value type is unsupported and prevents pipeline publication.</Trans></p>
                        )}
                        {hasInvalidEnum && (
                            <p><Trans>The configured allowed values are not an array and prevent pipeline publication.</Trans></p>
                        )}
                    </div>
                )}
            </div>
            <Button
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                className="text-destructive hover:text-destructive"
                aria-label={t`Delete validation rule for ${rule.spec.field || t`Field name`}`}
                data-testid={`datahub-validate-rule-delete-${index}-btn`}
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
});

interface NumberConstraintFieldProps {
    readonly label: string;
    readonly value: unknown;
    readonly onChange: (value: number | undefined) => void;
    readonly integer?: boolean;
}

function NumberConstraintField({
    label,
    value,
    onChange,
    integer = false,
}: NumberConstraintFieldProps) {
    const inputId = React.useId();
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.value) {
            onChange(undefined);
            return;
        }
        const parsed = Number(e.target.value);
        const valid = Number.isFinite(parsed)
            && (!integer || (Number.isInteger(parsed) && parsed >= 0));
        onChange(valid ? parsed : undefined);
    }, [integer, onChange]);

    return (
        <div className="space-y-1">
            <Label htmlFor={inputId}>{label}</Label>
            <Input
                id={inputId}
                type="number"
                value={typeof value === 'number' && Number.isFinite(value) ? value : ''}
                onChange={handleChange}
                min={integer ? 0 : undefined}
                step={integer ? 1 : 'any'}
            />
        </div>
    );
}

interface EnumConstraintFieldProps {
    readonly value: unknown;
    readonly onChange: (value: unknown[] | undefined) => void;
}

function EnumConstraintField({ value, onChange }: EnumConstraintFieldProps) {
    const { t } = useLingui();
    const inputId = React.useId();
    const formattedValue = formatValidationEnum(value);
    const [draft, setDraft] = React.useState(formattedValue);
    const [error, setError] = React.useState<string>();

    React.useEffect(() => {
        setDraft(formattedValue);
        setError(undefined);
    }, [formattedValue]);

    const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        setError(parseValidationEnum(nextDraft).error);
    }, []);

    const handleBlur = useCallback(() => {
        const result = parseValidationEnum(draft);
        setError(result.error);
        if (result.error) return;

        onChange(result.value);
        setDraft(formatValidationEnum(result.value));
    }, [draft, onChange]);

    return (
        <div className="space-y-1">
            <Label htmlFor={inputId}><Trans>Allowed values</Trans></Label>
            <Textarea
                id={inputId}
                value={draft}
                onChange={handleChange}
                onBlur={handleBlur}
                rows={3}
                placeholder={'["draft", "published"]'}
                className="font-mono text-xs"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${inputId}-error` : undefined}
            />
            <p className="text-xs text-muted-foreground">
                <Trans>JSON array. Values keep their JSON types.</Trans>
            </p>
            {error && (
                <p id={`${inputId}-error`} className="text-xs text-destructive">
                    {error === 'Enter valid JSON.'
                        ? t`Enter valid JSON.`
                        : t`Enter a JSON array of allowed values.`}
                </p>
            )}
        </div>
    );
}

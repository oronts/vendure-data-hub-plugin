import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import { getErrorMessage } from '../../../../../shared';
import { getOperatorPlaceholder } from '../../../../constants';
import { useStableKeys } from '../../../../hooks';
import {
    useComparisonOperators,
    type ComparisonOperatorOption,
} from '../../../../hooks/api/use-config-options';
import {
    formatConditionValue,
    isRuleCondition,
    parseJsonArray,
    parseLooseJsonValue,
} from './editor-utils';
import type { JsonRecord, RuleCondition, WhenEditorConfig } from './types';

interface AdvancedWhenEditorProps {
    config: JsonRecord;
    onChange: (values: JsonRecord) => void;
}

export function AdvancedWhenEditor({ config, onChange }: AdvancedWhenEditorProps) {
    const { t } = useLingui();
    const { operators: comparisonOperators, isLoading } = useComparisonOperators();
    const typedConfig = config as WhenEditorConfig;
    const rawConditions = Array.isArray(typedConfig.conditions) ? typedConfig.conditions : [];
    const conditions = rawConditions.filter(isRuleCondition);
    const invalidConditionCount = rawConditions.length - conditions.length;
    const action = typedConfig.action === 'drop' ? 'drop' : 'keep';
    const conditionKeys = useStableKeys(conditions, 'condition');
    const fieldIdPrefix = React.useId();
    const actionId = `${fieldIdPrefix}-action`;
    const conditionsId = `${fieldIdPrefix}-conditions`;

    const commit = React.useCallback((nextConditions: RuleCondition[]) => {
        onChange({ ...config, conditions: nextConditions });
    }, [config, onChange]);

    const addRule = React.useCallback(() => {
        const operator = comparisonOperators.find(candidate => !candidate.noValue)
            ?? comparisonOperators[0];
        if (!operator) return;
        commit([...conditions, { field: '', cmp: operator.value }]);
    }, [commit, comparisonOperators, conditions]);

    const updateRule = React.useCallback((
        index: number,
        patch: Partial<RuleCondition>,
    ) => {
        commit(conditions.map((condition, conditionIndex) => (
            conditionIndex === index ? { ...condition, ...patch } : condition
        )));
    }, [commit, conditions]);

    const removeRule = React.useCallback((index: number) => {
        commit(conditions.filter((_condition, conditionIndex) => conditionIndex !== index));
    }, [commit, conditions]);

    return (
        <Card data-testid="datahub-advanced-when-editor">
            <CardHeader className="py-3">
                <CardTitle className="text-sm"><Trans>Advanced: Rule Builder (When)</Trans></CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Label htmlFor={actionId} className="text-xs font-medium">
                        <Trans>Action</Trans>
                    </Label>
                    <Select
                        value={action}
                        onValueChange={value => onChange({ ...config, action: value })}
                    >
                        <SelectTrigger id={actionId} className="w-full sm:w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="keep"><Trans>Keep matches</Trans></SelectItem>
                            <SelectItem value="drop"><Trans>Drop matches</Trans></SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {invalidConditionCount > 0 && (
                    <p role="alert" className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        <Trans>Nested condition groups are not supported by the when operator.</Trans>
                    </p>
                )}
                <section aria-labelledby={conditionsId} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 id={conditionsId} className="text-xs font-medium">
                            <Trans>Conditions</Trans>
                        </h4>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={addRule}
                            disabled={isLoading || comparisonOperators.length === 0}
                            aria-label={t`Add rule`}
                        >
                            <Trans>Add rule</Trans>
                        </Button>
                    </div>
                    {conditions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            <Trans>No conditions configured. Add a rule to filter records.</Trans>
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {conditions.map((condition, index) => (
                                <RuleRow
                                    key={conditionKeys[index]}
                                    condition={condition}
                                    index={index}
                                    comparisonOperators={comparisonOperators}
                                    onUpdate={patch => updateRule(index, patch)}
                                    onRemove={() => removeRule(index)}
                                />
                            ))}
                        </div>
                    )}
                </section>
            </CardContent>
        </Card>
    );
}

interface RuleRowProps {
    condition: RuleCondition;
    index: number;
    comparisonOperators: ComparisonOperatorOption[];
    onUpdate: (patch: Partial<RuleCondition>) => void;
    onRemove: () => void;
}

function RuleRow({
    condition,
    index,
    comparisonOperators,
    onUpdate,
    onRemove,
}: RuleRowProps) {
    const { t } = useLingui();
    const comparison = String(condition.cmp ?? 'eq');
    const selectedOperator = comparisonOperators.find(operator => operator.value === comparison);
    const operatorOptions = selectedOperator || !comparison
        ? comparisonOperators
        : [{ value: comparison, label: comparison }, ...comparisonOperators];

    const handleOperatorChange = React.useCallback((value: string | null) => {
        if (value == null) return;
        onUpdate({ cmp: value, value: undefined });
    }, [onUpdate]);

    return (
        <div className="grid grid-cols-1 items-start gap-2 rounded border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.7fr)_minmax(0,1fr)_auto]">
            <Input
                aria-label={t`Field name`}
                value={String(condition.field ?? '')}
                onChange={event => onUpdate({ field: event.target.value })}
                placeholder={t`e.g. path.to.field`}
            />
            <Select value={comparison} onValueChange={handleOperatorChange}>
                <SelectTrigger
                    aria-label={t`Operator type`}
                    title={selectedOperator?.description ?? undefined}
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {operatorOptions.map(operator => (
                        <SelectItem key={operator.value} value={operator.value}>
                            {operator.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <RuleValueInput
                condition={condition}
                operator={selectedOperator}
                onChange={value => onUpdate({ value })}
            />
            <Button
                variant="ghost"
                size="sm"
                className="text-destructive sm:self-center"
                onClick={onRemove}
                aria-label={t`Remove rule ${index + 1}`}
            >
                <Trans>Remove</Trans>
            </Button>
        </div>
    );
}

interface RuleValueInputProps {
    condition: RuleCondition;
    operator: ComparisonOperatorOption | undefined;
    onChange: (value: unknown) => void;
}

function RuleValueInput({ condition, operator, onChange }: RuleValueInputProps) {
    const { t } = useLingui();
    const comparison = String(condition.cmp ?? 'eq');
    const externalText = formatConditionValue(condition.value);
    const [arrayDraft, setArrayDraft] = React.useState(externalText);
    const errorId = React.useId();
    const isArray = operator?.valueType === 'array';
    const parsedArray = React.useMemo(
        () => isArray ? parseJsonArray(arrayDraft) : null,
        [arrayDraft, isArray],
    );

    React.useEffect(() => setArrayDraft(externalText), [externalText]);

    if (operator?.noValue) {
        return (
            <div className="flex h-9 items-center rounded border bg-muted/30 px-3 text-xs text-muted-foreground">
                <Trans>No value required</Trans>
            </div>
        );
    }

    const field = String(condition.field ?? '').trim();
    const ariaLabel = field
        ? t`Comparison value for ${field}`
        : t`Comparison value`;
    const placeholder = operator?.example ?? getOperatorPlaceholder(comparison);

    if (isArray) {
        const handleArrayChange = (event: React.ChangeEvent<HTMLInputElement>) => {
            const text = event.target.value;
            setArrayDraft(text);
            const value = parseJsonArray(text);
            if (value) onChange(value);
        };
        return (
            <div>
                <Input
                    aria-label={ariaLabel}
                    value={arrayDraft}
                    onChange={handleArrayChange}
                    placeholder={placeholder}
                    aria-invalid={!parsedArray}
                    aria-describedby={!parsedArray ? errorId : undefined}
                />
                {!parsedArray && (
                    <p id={errorId} role="alert" className="mt-1 text-[11px] text-destructive">
                        <Trans>Enter a JSON array for this operator.</Trans>
                    </p>
                )}
            </div>
        );
    }

    if (operator?.valueType === 'number') {
        return (
            <Input
                type="number"
                inputMode="decimal"
                aria-label={ariaLabel}
                value={externalText}
                onChange={event => onChange(
                    event.target.value === '' ? undefined : Number(event.target.value),
                )}
                placeholder={placeholder}
            />
        );
    }

    const regexError = operator?.valueType === 'regex'
        ? getRegexError(externalText)
        : '';
    return (
        <div>
            <Input
                aria-label={ariaLabel}
                value={externalText}
                onChange={event => onChange(
                    operator?.valueType === 'string' || operator?.valueType === 'regex'
                        ? event.target.value
                        : parseLooseJsonValue(event.target.value),
                )}
                placeholder={placeholder}
                aria-invalid={Boolean(regexError)}
                aria-describedby={regexError ? errorId : undefined}
            />
            {regexError && (
                <p id={errorId} role="alert" className="mt-1 text-[11px] text-destructive">
                    {regexError}
                </p>
            )}
        </div>
    );
}

function getRegexError(value: string): string {
    try {
        new RegExp(value);
        return '';
    } catch (error: unknown) {
        return getErrorMessage(error);
    }
}

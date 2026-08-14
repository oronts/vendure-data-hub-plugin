import * as React from 'react';
import { useCallback, useMemo } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Label,
    Input,
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Button,
    Badge,
} from '@vendure/dashboard';
import { Trash2, Calendar } from 'lucide-react';
import type { PipelineTrigger, TriggerFormProps } from '../../../types';
import { SELECT_WIDTHS } from '../../../constants';
import {
    useConfigOptions,
    useTriggerTypes,
    useTriggerIconResolver,
    type TypedOptionValue,
    type ConfigOptionValue,
    type ConfigOptionsData,
    type ConnectionSchemaField,
} from '../../../hooks';
import { screamingSnakeToKebab } from '../../../../shared/utils/string-case';
import { getNestedValue } from '../../../../shared/utils/object-path';
import {
    applyTriggerSchemaDefaults,
    isTriggerSchemaFieldVisible,
    resolveTriggerFieldOptions,
} from '../../../utils/trigger-schema';
import { ResourceReferenceSelector } from '../ResourceReferenceSelector';

// ---------------------------------------------------------------------------
// Nested path helpers
// ---------------------------------------------------------------------------

/** Set a value on a trigger object using a dot-notation path, preserving existing nested values */
function setNestedValue(trigger: PipelineTrigger, path: string, value: unknown): PipelineTrigger {
    const parts = path.split('.');
    if (parts.length === 1) {
        return { ...trigger, [parts[0]]: value };
    }
    // For nested paths like 'message.queueType', merge into the nested object
    const rootKey = parts[0];
    const nestedKey = parts.slice(1).join('.');
    const triggerRecord: Record<string, unknown> = { ...trigger };
    const existingNested = triggerRecord[rootKey];
    const nestedObj = typeof existingNested === 'object' && existingNested != null
        ? { ...existingNested as Record<string, unknown> }
        : {};

    if (nestedKey.includes('.')) {
        // Recursive for deeper nesting (unlikely but safe)
        setDeep(nestedObj, nestedKey, value);
    } else {
        nestedObj[nestedKey] = value;
    }
    return { ...trigger, [rootKey]: nestedObj };
}

function setDeep(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (typeof current[key] !== 'object' || current[key] == null) {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// Option resolution
// ---------------------------------------------------------------------------

/** Resolve optionsRef to the actual option list from configOptions data */
// ---------------------------------------------------------------------------
// Schema-driven field renderer
// ---------------------------------------------------------------------------

function SchemaDrivenFields({
    trigger,
    schema,
    configData,
    onChange,
    readOnly,
}: {
    trigger: PipelineTrigger;
    schema: TypedOptionValue;
    configData: ConfigOptionsData | undefined;
    onChange: (trigger: PipelineTrigger) => void;
    readOnly: boolean;
}) {
    const { t } = useLingui();
    const fieldIdPrefix = React.useId();

    if (schema.fields.length === 0) return null;

    const keyMap = schema.configKeyMap ?? {};
    const triggerRecord: Record<string, unknown> = { ...trigger };

    const handleFieldChange = (field: ConnectionSchemaField, rawValue: unknown) => {
        const pipelinePath = (keyMap as Record<string, string>)[field.key] ?? field.key;
        const fieldType = field.type.toLowerCase();

        let value = rawValue;
        if (fieldType === 'number') {
            const parsed = Number(rawValue);
            value = Number.isFinite(parsed) ? parsed : field.defaultValue ?? 0;
        }

        onChange(setNestedValue(trigger, pipelinePath, value));
    };

    const getFieldValue = (field: ConnectionSchemaField): unknown => {
        const pipelinePath = (keyMap as Record<string, string>)[field.key] ?? field.key;
        return getNestedValue(triggerRecord, pipelinePath);
    };

    const typeSuffix = screamingSnakeToKebab(trigger.type);

    return (
        <div className="space-y-4 border-t pt-4" data-testid={`datahub-triggerform-field-${typeSuffix}`}>
            {schema.fields.map(field => {
                if (!isTriggerSchemaFieldVisible(field, triggerRecord)) return null;

                const fieldType = field.type.toLowerCase();
                const currentValue = getFieldValue(field);
                const options = resolveTriggerFieldOptions(field, configData);
                const fieldId = `${fieldIdPrefix}-${field.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

                // String field with optionsRef='cronPresets' renders a side-by-side presets picker
                if (fieldType === 'string' && field.optionsRef === 'cronPresets') {
                    return (
                        <div key={field.key} className="space-y-2">
                            <Label htmlFor={fieldId}>
                                {field.label}{field.required ? ' *' : ''}
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    id={fieldId}
                                    value={String(currentValue ?? '')}
                                    onChange={(e) => handleFieldChange(field, e.target.value)}
                                    placeholder={field.placeholder ?? undefined}
                                    disabled={readOnly}
                                    className="font-mono"
                                />
                                <Select
                                    value=""
                                    onValueChange={(v) => handleFieldChange(field, v)}
                                    disabled={readOnly}
                                >
                                    <SelectTrigger
                                        className={SELECT_WIDTHS.TRIGGER_TYPE}
                                        aria-label={t`Presets`}
                                    >
                                        <Calendar className="h-4 w-4 mr-2" />
                                        <span><Trans>Presets</Trans></span>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {options.map((p) => (
                                            <SelectItem key={p.value} value={p.value}>
                                                {p.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {field.description && (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                        </div>
                    );
                }

                // Select fields (with optionsRef or static options)
                if (fieldType === 'select') {
                    const selectValue = String(currentValue ?? field.defaultValue ?? '');
                    const hasCategories = options.some(o => o.category);

                    if (hasCategories) {
                        // Group options by category (e.g. vendureEvents)
                        const grouped: Record<string, ConfigOptionValue[]> = {};
                        for (const opt of options) {
                            const cat = opt.category || t`Other`;
                            if (!grouped[cat]) grouped[cat] = [];
                            grouped[cat].push(opt);
                        }
                        return (
                            <div key={field.key} className="space-y-2">
                                <Label htmlFor={fieldId}>
                                    {field.label}{field.required ? ' *' : ''}
                                </Label>
                                <Select
                                    value={selectValue}
                                    onValueChange={(v) => handleFieldChange(field, v)}
                                    disabled={readOnly}
                                >
                                    <SelectTrigger id={fieldId}>
                                        <SelectValue
                                            placeholder={field.placeholder ?? t`Select ${field.label}`}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(grouped).map(([category, catOptions]) => (
                                            <React.Fragment key={category}>
                                                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                                                    {category}
                                                </div>
                                                {catOptions.map((opt) => (
                                                    <SelectItem key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </SelectItem>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {field.description && (
                                    <p className="text-xs text-muted-foreground">{field.description}</p>
                                )}
                            </div>
                        );
                    }

                    return (
                        <div key={field.key} className="space-y-2">
                            <Label htmlFor={fieldId}>
                                {field.label}{field.required ? ' *' : ''}
                            </Label>
                            <Select
                                value={selectValue}
                                onValueChange={(v) => handleFieldChange(field, v)}
                                disabled={readOnly}
                            >
                                <SelectTrigger id={fieldId}>
                                    <SelectValue
                                        placeholder={field.placeholder ?? t`Select ${field.label}`}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {options.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            <div className="flex flex-col">
                                                <span>{opt.label}</span>
                                                {opt.description && (
                                                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {field.description && (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                        </div>
                    );
                }

                if (fieldType === 'secret' || fieldType === 'connection') {
                    return (
                        <div key={field.key} className="space-y-2">
                            <Label htmlFor={fieldId}>
                                {field.label}{field.required ? ' *' : ''}
                            </Label>
                            <ResourceReferenceSelector
                                id={fieldId}
                                resource={fieldType}
                                value={String(currentValue ?? '')}
                                onValueChange={value => handleFieldChange(field, value)}
                                placeholder={field.placeholder ?? (fieldType === 'secret'
                                    ? t`Select secret...`
                                    : t`Select connection...`)}
                                disabled={readOnly}
                            />
                            {field.description && (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                        </div>
                    );
                }

                // Number fields
                if (fieldType === 'number') {
                    const numValue = currentValue != null ? Number(currentValue) : (field.defaultValue as number ?? 0);
                    return (
                        <div key={field.key} className="space-y-2">
                            <Label htmlFor={fieldId}>
                                {field.label}{field.required ? ' *' : ''}
                            </Label>
                            <Input
                                id={fieldId}
                                type="number"
                                value={numValue}
                                onChange={(e) => handleFieldChange(field, e.target.value)}
                                placeholder={field.placeholder ?? undefined}
                                min={field.min ?? undefined}
                                max={field.max ?? undefined}
                                disabled={readOnly}
                            />
                            {field.description && (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                        </div>
                    );
                }

                // Boolean fields
                if (fieldType === 'boolean') {
                    const boolValue = currentValue != null ? Boolean(currentValue) : (field.defaultValue as boolean ?? false);
                    return (
                        <div key={field.key} className="flex items-center gap-2">
                            <Switch
                                id={fieldId}
                                checked={boolValue}
                                onCheckedChange={(checked) => handleFieldChange(field, checked)}
                                disabled={readOnly}
                            />
                            <Label htmlFor={fieldId}>{field.label}</Label>
                        </div>
                    );
                }

                // Default: string/text input
                return (
                    <div key={field.key} className="space-y-2">
                        <Label htmlFor={fieldId}>
                            {field.label}{field.required ? ' *' : ''}
                        </Label>
                        <Input
                            id={fieldId}
                            value={String(currentValue ?? '')}
                            onChange={(e) => handleFieldChange(field, e.target.value)}
                            placeholder={field.placeholder ?? undefined}
                            disabled={readOnly}
                        />
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// TriggerForm
// ---------------------------------------------------------------------------

export function TriggerForm({
    trigger,
    onChange,
    onRemove,
    readOnly = false,
    compact = false,
}: TriggerFormProps) {
    const { t } = useLingui();
    const formId = React.useId();
    const enabledId = `${formId}-enabled`;
    const typeId = `${formId}-type`;
    const { data: configData } = useConfigOptions();
    const { configList, triggerSchemas } = useTriggerTypes();
    const resolveTriggerIcon = useTriggerIconResolver();

    const currentSchema = useMemo(
        () => triggerSchemas.find(s => s.value === trigger.type),
        [triggerSchemas, trigger.type],
    );

    const handleChange = useCallback(<K extends keyof PipelineTrigger>(
        key: K,
        value: PipelineTrigger[K]
    ) => {
        onChange({ ...trigger, [key]: value });
    }, [trigger, onChange]);

    const TriggerIcon = resolveTriggerIcon(trigger.type);

    const handleTriggerTypeChange = useCallback((type: string | null) => {
        if (type == null) return;
        const schema = triggerSchemas.find(item => item.value === type);
        onChange(applyTriggerSchemaDefaults(
            trigger as unknown as Record<string, unknown>,
            type,
            schema,
        ) as unknown as PipelineTrigger);
    }, [onChange, trigger, triggerSchemas]);

    const formContent = (
        <>
            {!compact && (
                <div className="flex items-center justify-between">
                    <Label htmlFor={enabledId}>
                        <Trans>Enabled</Trans>
                    </Label>
                    <Switch
                        id={enabledId}
                        checked={trigger.enabled !== false}
                        onCheckedChange={(checked) => handleChange('enabled', checked)}
                        disabled={readOnly}
                    />
                </div>
            )}

            <div className="space-y-2" data-testid="datahub-triggerform-field-type">
                <Label htmlFor={typeId}>
                    <Trans>Trigger Type</Trans>
                </Label>
                <Select
                    value={trigger.type}
                    onValueChange={handleTriggerTypeChange}
                    disabled={readOnly}
                >
                    <SelectTrigger id={typeId}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {configList.map((config) => {
                            const Icon = resolveTriggerIcon(config.type);
                            return (
                                <SelectItem key={config.type} value={config.type}>
                                    <span className="flex items-center gap-2">
                                        <Icon className="h-4 w-4" />
                                        {config.label}
                                    </span>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            </div>

            {currentSchema && currentSchema.fields.length > 0 && (
                <SchemaDrivenFields
                    trigger={trigger}
                    schema={currentSchema}
                    configData={configData}
                    onChange={onChange}
                    readOnly={readOnly}
                />
            )}
        </>
    );

    if (compact) {
        return <div className="space-y-4" data-testid="datahub-triggerform-form">{formContent}</div>;
    }

    return (
        <Card data-testid="datahub-triggerform-form">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <TriggerIcon className="h-4 w-4" />
                        <Trans>Trigger Configuration</Trans>
                        {trigger.enabled !== false && (
                            <Badge variant="secondary" className="text-xs">
                                <Trans>Active</Trans>
                            </Badge>
                        )}
                    </CardTitle>
                    {onRemove && !readOnly && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onRemove}
                            className="text-destructive hover:text-destructive"
                            aria-label={t`Remove trigger`}
                            data-testid="datahub-trigger-remove-btn"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {formContent}
            </CardContent>
        </Card>
    );
}

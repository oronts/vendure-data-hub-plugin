import * as React from 'react';
import { useCallback, useMemo } from 'react';
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
import type { PipelineTrigger, TriggerType, TriggerFormProps } from '../../../types';
import { SELECT_WIDTHS } from '../../../constants';
import {
    useConfigOptions,
    useTriggerTypes,
    useTriggerIconResolver,
    type TypedOptionValue,
    type ConfigOptionValue,
    type ConnectionSchemaField,
} from '../../../hooks';
import { screamingSnakeToKebab } from '../../../../shared/utils/string-case';
import { getNestedValue } from '../../../../shared/utils/object-path';

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
    const existingNested = (trigger as Record<string, unknown>)[rootKey];
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

type ConfigOptionsData = Record<string, ConfigOptionValue[] | unknown>;

/** Resolve optionsRef to the actual option list from configOptions data */
function resolveOptions(
    field: ConnectionSchemaField,
    configData: ConfigOptionsData | undefined,
    fallbacks: Record<string, ConfigOptionValue[]>,
): ConfigOptionValue[] {
    // Static options on the field itself take priority
    if (field.options && field.options.length > 0) {
        return field.options.map(o => ({ value: o.value, label: o.label }));
    }
    if (!field.optionsRef) return [];

    const ref = field.optionsRef;
    const backendOptions = configData?.[ref];
    if (Array.isArray(backendOptions) && backendOptions.length > 0) {
        return (backendOptions as ConfigOptionValue[]).filter(o => o.value !== '');
    }
    return (fallbacks[ref] ?? []).filter(o => o.value !== '');
}

// ---------------------------------------------------------------------------
// Schema-driven field renderer
// ---------------------------------------------------------------------------

function SchemaDrivenFields({
    trigger,
    schema,
    configData,
    secretCodes,
    onChange,
    readOnly,
}: {
    trigger: PipelineTrigger;
    schema: TypedOptionValue;
    configData: ConfigOptionsData | undefined;
    secretCodes: string[];
    onChange: (trigger: PipelineTrigger) => void;
    readOnly: boolean;
}) {
    if (schema.fields.length === 0) return null;

    const keyMap = schema.configKeyMap ?? {};
    const triggerRecord = trigger as Record<string, unknown>;

    const optionFallbacks: Record<string, ConfigOptionValue[]> = {};

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

    /** Secret-type fields are hidden when the trigger has no authentication configured */
    const isSecretFieldVisible = (field: ConnectionSchemaField): boolean => {
        if (field.type.toLowerCase() !== 'secret') return true;
        const auth = triggerRecord['authentication'];
        return auth != null && auth !== '' && auth !== 'NONE';
    };

    const typeSuffix = screamingSnakeToKebab(trigger.type);

    return (
        <div className="space-y-4 border-t pt-4" data-testid={`datahub-triggerform-field-${typeSuffix}`}>
            {schema.fields.map(field => {
                if (!isSecretFieldVisible(field)) return null;

                const fieldType = field.type.toLowerCase();
                const currentValue = getFieldValue(field);
                const options = resolveOptions(field, configData, optionFallbacks);

                // String field with optionsRef='cronPresets' renders a side-by-side presets picker
                if (fieldType === 'string' && field.optionsRef === 'cronPresets') {
                    return (
                        <div key={field.key} className="space-y-2">
                            <Label>{field.label}{field.required ? ' *' : ''}</Label>
                            <div className="flex gap-2">
                                <Input
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
                                    <SelectTrigger className={SELECT_WIDTHS.TRIGGER_TYPE}>
                                        <Calendar className="h-4 w-4 mr-2" />
                                        <span>Presets</span>
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
                            const cat = opt.category || 'Other';
                            if (!grouped[cat]) grouped[cat] = [];
                            grouped[cat].push(opt);
                        }
                        return (
                            <div key={field.key} className="space-y-2">
                                <Label>{field.label}{field.required ? ' *' : ''}</Label>
                                <Select
                                    value={selectValue}
                                    onValueChange={(v) => handleFieldChange(field, v)}
                                    disabled={readOnly}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={field.placeholder ?? `Select ${field.label}`} />
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
                            <Label>{field.label}{field.required ? ' *' : ''}</Label>
                            <Select
                                value={selectValue}
                                onValueChange={(v) => handleFieldChange(field, v)}
                                disabled={readOnly}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={field.placeholder ?? `Select ${field.label}`} />
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

                // Secret reference fields (select from secretCodes prop)
                if (fieldType === 'secret') {
                    return (
                        <div key={field.key} className="space-y-2">
                            <Label>{field.label}{field.required ? ' *' : ''}</Label>
                            <Select
                                value={String(currentValue ?? '')}
                                onValueChange={(v) => handleFieldChange(field, v)}
                                disabled={readOnly}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={field.placeholder ?? 'Select secret...'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {secretCodes.map((code) => (
                                        <SelectItem key={code} value={code}>
                                            {code}
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

                // Number fields
                if (fieldType === 'number') {
                    const numValue = currentValue != null ? Number(currentValue) : (field.defaultValue as number ?? 0);
                    return (
                        <div key={field.key} className="space-y-2">
                            <Label>{field.label}{field.required ? ' *' : ''}</Label>
                            <Input
                                type="number"
                                value={numValue}
                                onChange={(e) => handleFieldChange(field, e.target.value)}
                                placeholder={field.placeholder ?? undefined}
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
                                checked={boolValue}
                                onCheckedChange={(checked) => handleFieldChange(field, checked)}
                                disabled={readOnly}
                            />
                            <Label>{field.label}</Label>
                        </div>
                    );
                }

                // Default: string/text input
                return (
                    <div key={field.key} className="space-y-2">
                        <Label>{field.label}{field.required ? ' *' : ''}</Label>
                        <Input
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
    secretCodes = [],
    compact = false,
}: TriggerFormProps) {
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

    const formContent = (
        <>
            {!compact && (
                <div className="flex items-center justify-between">
                    <Label htmlFor="trigger-enabled">Enabled</Label>
                    <Switch
                        id="trigger-enabled"
                        checked={trigger.enabled !== false}
                        onCheckedChange={(checked) => handleChange('enabled', checked)}
                        disabled={readOnly}
                    />
                </div>
            )}

            <div className="space-y-2" data-testid="datahub-triggerform-field-type">
                <Label>Trigger Type</Label>
                <Select
                    value={trigger.type}
                    onValueChange={(v) => handleChange('type', v as TriggerType)}
                    disabled={readOnly}
                >
                    <SelectTrigger>
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
                    configData={configData as unknown as ConfigOptionsData}
                    secretCodes={secretCodes}
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
                        Trigger Configuration
                        {trigger.enabled !== false && (
                            <Badge variant="secondary" className="text-xs">
                                Active
                            </Badge>
                        )}
                    </CardTitle>
                    {onRemove && !readOnly && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onRemove}
                            className="text-destructive hover:text-destructive"
                            aria-label="Remove trigger"
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

import * as React from 'react';
import { useCallback, useEffect, useRef, useMemo, memo } from 'react';
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
} from '@vendure/dashboard';
import { Plus, Trash2 } from 'lucide-react';
import { useEntityLoaders } from '../../../hooks/api/use-entity-loaders';
import { useEnrichmentSourceSchemas, type ConnectionSchemaField } from '../../../hooks/api/use-config-options';
import { useStableIndexIds } from '../../../hooks/use-stable-keys';

export interface EnrichConfigComponentProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
}

interface DefaultValue {
    id: string;
    field: string;
    value: string;
}

let defaultValueIdCounter = 0;
function generateDefaultValueId(): string {
    return `default-value-${Date.now()}-${++defaultValueIdCounter}`;
}

export function EnrichConfigComponent({
    config,
    onChange,
}: EnrichConfigComponentProps) {
    const { schemas: sourceTypeSchemas } = useEnrichmentSourceSchemas();
    const { entities } = useEntityLoaders();
    const entityOptions = useMemo(
        () => entities.map(e => ({ value: e.code, label: e.name })),
        [entities],
    );

    const sourceType = (config.sourceType as string) || 'STATIC';
    const currentSourceSchema = sourceTypeSchemas.find(s => s.value === sourceType);
    const sourceTypeId = React.useId();

    // Use refs to avoid stale closures in the initialization effect
    const configRef = useRef(config);
    const onChangeRef = useRef(onChange);
    configRef.current = config;
    onChangeRef.current = onChange;

    // Initialize sourceType if not set - ensures validation passes
    useEffect(() => {
        if (!configRef.current.sourceType) {
            onChangeRef.current({ ...configRef.current, sourceType: 'STATIC' });
        }
    }, []);
    const defaults = (config.defaults as Record<string, unknown>) || {};

    const defaultsEntries = Object.entries(defaults);
    const stableIds = useStableIndexIds(defaultsEntries, 'default-value');

    const defaultsList: DefaultValue[] = defaultsEntries.map(([field, value], index) => ({
        id: stableIds[index] || generateDefaultValueId(),
        field,
        value: typeof value === 'string' ? value : JSON.stringify(value),
    }));

    const updateField = useCallback((key: string, value: unknown) => {
        onChange({ ...config, [key]: value });
    }, [config, onChange]);

    const updateDefaults = useCallback((list: DefaultValue[]) => {
        const newDefaults: Record<string, unknown> = {};
        for (const item of list) {
            if (item.field.trim()) {
                try {
                    newDefaults[item.field] = JSON.parse(item.value);
                } catch {
                    newDefaults[item.field] = item.value;
                }
            }
        }
        onChange({ ...config, defaults: newDefaults });
    }, [config, onChange]);

    const addDefault = useCallback(() => {
        updateDefaults([...defaultsList, { id: generateDefaultValueId(), field: '', value: '' }]);
    }, [defaultsList, updateDefaults]);

    const updateDefaultItem = useCallback((index: number, field: string, value: string) => {
        const newList = [...defaultsList];
        newList[index] = { ...newList[index], field, value };
        updateDefaults(newList);
    }, [defaultsList, updateDefaults]);

    const removeDefault = useCallback((index: number) => {
        const newList = defaultsList.filter((_, i) => i !== index);
        updateDefaults(newList);
    }, [defaultsList, updateDefaults]);

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor={sourceTypeId} className="text-sm font-medium">
                    <Trans>Enrichment source</Trans>
                </Label>
                <Select
                    value={sourceType}
                    onValueChange={(v) => updateField('sourceType', v)}
                >
                    <SelectTrigger
                        id={sourceTypeId}
                        className="w-full"
                        data-testid="datahub-enrich-source-select"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {sourceTypeSchemas.map((st) => (
                            <SelectItem key={st.value} value={st.value}>
                                {st.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    {currentSourceSchema?.description}
                </p>
            </div>

            {currentSourceSchema && currentSourceSchema.fields.length > 0 && (
                <div className="space-y-3">
                    {currentSourceSchema.fields.map(field => (
                        <EnrichSchemaField
                            key={field.key}
                            field={field}
                            value={field.type === 'keyValuePairs' ? defaults : (config[field.key] as string || '')}
                            onChange={(value) => {
                                if (field.type === 'keyValuePairs') {
                                    onChange({ ...config, defaults: value });
                                } else {
                                    updateField(field.key, value);
                                }
                            }}
                            entityOptions={entityOptions}
                            defaultsList={defaultsList}
                            addDefault={addDefault}
                            updateDefaultItem={updateDefaultItem}
                            removeDefault={removeDefault}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface EnrichSchemaFieldProps {
    field: ConnectionSchemaField;
    value: unknown;
    onChange: (value: unknown) => void;
    entityOptions: Array<{ value: string; label: string }>;
    defaultsList: DefaultValue[];
    addDefault: () => void;
    updateDefaultItem: (index: number, field: string, value: string) => void;
    removeDefault: (index: number) => void;
}

/** Field type renderer registry: maps field.type to a render function. */
interface EnrichFieldRendererProps extends EnrichSchemaFieldProps {
    inputId: string;
    addDefaultLabel: string;
    addFieldLabel: string;
    noDefaultValuesLabel: string;
    selectEntityLabel: string;
}

type EnrichFieldRenderer = (props: EnrichFieldRendererProps) => React.JSX.Element;

const ENRICH_FIELD_RENDERERS: Record<string, EnrichFieldRenderer> = {
    keyValuePairs: ({
        field,
        inputId,
        defaultsList,
        addDefault,
        updateDefaultItem,
        removeDefault,
        addDefaultLabel,
        addFieldLabel,
        noDefaultValuesLabel,
    }) => (
        <div className="space-y-3" role="group" aria-labelledby={inputId}>
            <div className="flex items-center justify-between">
                <Label id={inputId} className="text-sm font-medium">{field.label}</Label>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={addDefault}
                    aria-label={addDefaultLabel}
                    data-testid="datahub-enrich-add-default-btn"
                >
                    <Plus className="h-3 w-3 mr-1" />
                    {addFieldLabel}
                </Button>
            </div>
            {defaultsList.length === 0 && (
                <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
                    {noDefaultValuesLabel}
                </p>
            )}
            {defaultsList.map((item, index) => (
                <DefaultValueRow
                    key={item.id}
                    item={item}
                    index={index}
                    updateDefaultItem={updateDefaultItem}
                    removeDefault={removeDefault}
                />
            ))}
        </div>
    ),

    entitySelect: ({ field, value, onChange, entityOptions, selectEntityLabel, inputId }) => (
        <div className="space-y-2">
            <Label htmlFor={inputId} className="text-sm font-medium">{field.label}</Label>
            <Select value={String(value || '')} onValueChange={(v) => onChange(v)}>
                <SelectTrigger id={inputId} className="w-full">
                    <SelectValue placeholder={selectEntityLabel} />
                </SelectTrigger>
                <SelectContent>
                    {entityOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
        </div>
    ),
};

/** Default renderer for unrecognized field types (text input). */
function defaultEnrichFieldRenderer({
    field,
    value,
    onChange,
    inputId,
}: EnrichFieldRendererProps): React.JSX.Element {
    return (
        <div className="space-y-2">
            <Label htmlFor={inputId} className="text-sm font-medium">{field.label}</Label>
            <Input
                id={inputId}
                value={String(value || '')}
                onChange={(e) => onChange(e.target.value)}
                placeholder={field.placeholder ?? undefined}
            />
            {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
        </div>
    );
}

function EnrichSchemaField(props: EnrichSchemaFieldProps) {
    const { t } = useLingui();
    const inputId = React.useId();
    const renderer = ENRICH_FIELD_RENDERERS[props.field.type] ?? defaultEnrichFieldRenderer;
    return renderer({
        ...props,
        inputId,
        addDefaultLabel: t`Add default field value`,
        addFieldLabel: t`Add field`,
        noDefaultValuesLabel: t`No default values defined. Add fields to set on each record.`,
        selectEntityLabel: t`Select entity...`,
    });
}

interface DefaultValueRowProps {
    item: DefaultValue;
    index: number;
    updateDefaultItem: (index: number, field: string, value: string) => void;
    removeDefault: (index: number) => void;
}

const DefaultValueRow = memo(function DefaultValueRow({
    item,
    index,
    updateDefaultItem,
    removeDefault,
}: DefaultValueRowProps) {
    const { t } = useLingui();
    const handleFieldChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateDefaultItem(index, e.target.value, item.value);
    }, [index, item.value, updateDefaultItem]);

    const handleValueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateDefaultItem(index, item.field, e.target.value);
    }, [index, item.field, updateDefaultItem]);

    const handleRemove = useCallback(() => {
        removeDefault(index);
    }, [index, removeDefault]);

    return (
        <div className="flex items-start gap-2" data-testid={`datahub-enrich-default-row-${index}`}>
            <Input
                aria-label={t`Field name`}
                value={item.field}
                onChange={handleFieldChange}
                placeholder={t`Field name`}
                className="w-40"
            />
            <Input
                aria-label={t`Value (JSON or string)`}
                value={item.value}
                onChange={handleValueChange}
                placeholder={t`Value (JSON or string)`}
                className="flex-1"
            />
            <Button
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                className="text-destructive hover:text-destructive"
                aria-label={t`Remove default value for ${item.field || t`Field name`}`}
                data-testid={`datahub-enrich-remove-default-${index}-btn`}
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
});

import * as React from 'react';
import { useCallback, useEffect, useRef, useMemo, memo } from 'react';
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

/**
 * Hook to maintain stable IDs for list items across renders.
 * Maps field names to stable IDs, generating new IDs only for new fields.
 */
function useStableIds(fields: string[]): Map<number, string> {
    const idMapRef = useRef<Map<number, string>>(new Map());
    const previousFieldsRef = useRef<string[]>([]);

    return useMemo(() => {
        const newIdMap = new Map<number, string>();
        const previousFields = previousFieldsRef.current;
        const previousIdMap = idMapRef.current;

        fields.forEach((field, index) => {
            // Try to find a matching previous item by index first (most common case)
            if (index < previousFields.length && previousIdMap.has(index)) {
                // Reuse the ID from the same position
                newIdMap.set(index, previousIdMap.get(index)!);
            } else {
                // Generate a new ID for new items
                newIdMap.set(index, generateDefaultValueId());
            }
        });

        previousFieldsRef.current = [...fields];
        idMapRef.current = newIdMap;

        return newIdMap;
    }, [fields]);
}

const SOURCE_TYPES = [
    { value: 'STATIC', label: 'Static Values', description: 'Set fixed values on records' },
    { value: 'HTTP', label: 'HTTP Lookup', description: 'Fetch data from external API' },
    { value: 'VENDURE', label: 'Vendure Entity', description: 'Lookup from Vendure data' },
];

const VENDURE_ENTITY_OPTIONS = [
    { value: 'PRODUCT', label: 'Product' },
    { value: 'PRODUCT_VARIANT', label: 'Product Variant' },
    { value: 'CUSTOMER', label: 'Customer' },
    { value: 'CUSTOMER_GROUP', label: 'Customer Group' },
    { value: 'ORDER', label: 'Order' },
    { value: 'COLLECTION', label: 'Collection' },
    { value: 'FACET', label: 'Facet' },
    { value: 'FACET_VALUE', label: 'Facet Value' },
    { value: 'PROMOTION', label: 'Promotion' },
    { value: 'ASSET', label: 'Asset' },
    { value: 'SHIPPING_METHOD', label: 'Shipping Method' },
    { value: 'PAYMENT_METHOD', label: 'Payment Method' },
    { value: 'TAX_CATEGORY', label: 'Tax Category' },
    { value: 'TAX_RATE', label: 'Tax Rate' },
    { value: 'COUNTRY', label: 'Country' },
    { value: 'ZONE', label: 'Zone' },
    { value: 'CHANNEL', label: 'Channel' },
    { value: 'TAG', label: 'Tag' },
    { value: 'STOCK_LOCATION', label: 'Stock Location' },
    { value: 'INVENTORY', label: 'Inventory' },
] as const;

export function EnrichConfigComponent({
    config,
    onChange,
}: EnrichConfigComponentProps) {
    const sourceType = (config.sourceType as string) || 'STATIC';

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
    const endpoint = (config.endpoint as string) || '';
    const entity = (config.entity as string) || '';
    const matchField = (config.matchField as string) || '';

    const defaultsEntries = Object.entries(defaults);
    const stableIds = useStableIds(defaultsEntries.map(([field]) => field));

    const defaultsList: DefaultValue[] = defaultsEntries.map(([field, value], index) => ({
        id: stableIds.get(index) || generateDefaultValueId(),
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
                <Label className="text-sm font-medium">Enrichment Source</Label>
                <Select
                    value={sourceType}
                    onValueChange={(v) => updateField('sourceType', v)}
                >
                    <SelectTrigger className="w-full" data-testid="datahub-enrich-source-select">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SOURCE_TYPES.map((st) => (
                            <SelectItem key={st.value} value={st.value}>
                                {st.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    {SOURCE_TYPES.find(st => st.value === sourceType)?.description}
                </p>
            </div>

            {sourceType === 'STATIC' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Default Values</Label>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={addDefault}
                            aria-label="Add default field value"
                            data-testid="datahub-enrich-add-default-btn"
                        >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Field
                        </Button>
                    </div>

                    {defaultsList.length === 0 && (
                        <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
                            No default values defined. Add fields to set on each record.
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
            )}

            {sourceType === 'HTTP' && (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">API Endpoint</Label>
                        <Input
                            value={endpoint}
                            onChange={(e) => updateField('endpoint', e.target.value)}
                            placeholder="https://api.example.com/lookup"
                        />
                        <p className="text-xs text-muted-foreground">
                            URL to fetch enrichment data. Use {'{{field}}'} for dynamic values.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Match Field</Label>
                        <Input
                            value={matchField}
                            onChange={(e) => updateField('matchField', e.target.value)}
                            placeholder="sku"
                        />
                        <p className="text-xs text-muted-foreground">
                            Record field to use for lookup matching
                        </p>
                    </div>
                </div>
            )}

            {sourceType === 'VENDURE' && (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Entity Type</Label>
                        <Select
                            value={entity}
                            onValueChange={(v) => updateField('entity', v)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select entity..." />
                            </SelectTrigger>
                            <SelectContent>
                                {VENDURE_ENTITY_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Match Field</Label>
                        <Input
                            value={matchField}
                            onChange={(e) => updateField('matchField', e.target.value)}
                            placeholder="sku"
                        />
                        <p className="text-xs text-muted-foreground">
                            Record field to match against Vendure entity
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
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
                value={item.field}
                onChange={handleFieldChange}
                placeholder="Field name"
                className="w-40"
            />
            <Input
                value={item.value}
                onChange={handleValueChange}
                placeholder="Value (JSON or string)"
                className="flex-1"
            />
            <Button
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                className="text-destructive hover:text-destructive"
                aria-label={`Remove default value for ${item.field || 'field'}`}
                data-testid={`datahub-enrich-remove-default-${index}-btn`}
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
});

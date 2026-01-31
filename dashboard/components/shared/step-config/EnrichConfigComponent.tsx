import * as React from 'react';
import { useCallback, useEffect } from 'react';
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
    field: string;
    value: string;
}

const SOURCE_TYPES = [
    { value: 'STATIC', label: 'Static Values', description: 'Set fixed values on records' },
    { value: 'HTTP', label: 'HTTP Lookup', description: 'Fetch data from external API' },
    { value: 'VENDURE', label: 'Vendure Entity', description: 'Lookup from Vendure data' },
];

export function EnrichConfigComponent({
    config,
    onChange,
}: EnrichConfigComponentProps) {
    const sourceType = (config.sourceType as string) || 'STATIC';

    // Initialize sourceType if not set - ensures validation passes
    useEffect(() => {
        if (!config.sourceType) {
            onChange({ ...config, sourceType: 'STATIC' });
        }
    }, []);
    const defaults = (config.defaults as Record<string, unknown>) || {};
    const endpoint = (config.endpoint as string) || '';
    const entity = (config.entity as string) || '';
    const matchField = (config.matchField as string) || '';

    const defaultsList: DefaultValue[] = Object.entries(defaults).map(([field, value]) => ({
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
        updateDefaults([...defaultsList, { field: '', value: '' }]);
    }, [defaultsList, updateDefaults]);

    const updateDefaultItem = useCallback((index: number, field: string, value: string) => {
        const newList = [...defaultsList];
        newList[index] = { field, value };
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
                    <SelectTrigger className="w-full">
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
                        <Button variant="outline" size="sm" onClick={addDefault}>
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
                        <div key={index} className="flex items-start gap-2">
                            <Input
                                value={item.field}
                                onChange={(e) => updateDefaultItem(index, e.target.value, item.value)}
                                placeholder="Field name"
                                className="w-40"
                            />
                            <Input
                                value={item.value}
                                onChange={(e) => updateDefaultItem(index, item.field, e.target.value)}
                                placeholder="Value (JSON or string)"
                                className="flex-1"
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeDefault(index)}
                                className="text-destructive hover:text-destructive"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
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
                                <SelectItem value="Product">Product</SelectItem>
                                <SelectItem value="ProductVariant">Product Variant</SelectItem>
                                <SelectItem value="Customer">Customer</SelectItem>
                                <SelectItem value="Collection">Collection</SelectItem>
                                <SelectItem value="Facet">Facet</SelectItem>
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

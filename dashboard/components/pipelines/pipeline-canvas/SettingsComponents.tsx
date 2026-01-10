import * as React from 'react';
import {
    Button,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Textarea,
} from '@vendure/dashboard';
import { Plus, X, ArrowRight, Upload, AlertCircle } from 'lucide-react';
import { NODE_CATALOG } from './constants';
import type { PipelineNode, Condition } from './types';

// SOURCE SETTINGS

interface SourceSettingsProps {
    node: PipelineNode;
    connections: Array<{ id: string; code: string; name: string; type: string }>;
    onChange: (key: string, value: any) => void;
}

export function SourceSettings({ node, connections, onChange }: SourceSettingsProps) {
    const sourceType = node.config.adapterCode || 'csv';

    return (
        <div className="space-y-4">
            <h4 className="font-medium">Source Configuration</h4>

            <div className="space-y-2">
                <Label>Source Type</Label>
                <Select value={sourceType} onValueChange={v => onChange('adapterCode', v)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {NODE_CATALOG.sources.map(s => (
                            <SelectItem key={s.type} value={s.type}>
                                <div className="flex items-center gap-2">
                                    <s.icon className="w-4 h-4" />
                                    {s.name}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {(sourceType === 'csv' || sourceType === 'excel') && (
                <>
                    <div className="space-y-2">
                        <Label>File Path or Upload</Label>
                        <div className="flex gap-2">
                            <Input
                                value={node.config.filePath || ''}
                                onChange={e => onChange('filePath', e.target.value)}
                                placeholder="/path/to/file.csv"
                            />
                            <Button variant="outline" size="icon">
                                <Upload className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Delimiter</Label>
                        <Select value={node.config.delimiter || ','} onValueChange={v => onChange('delimiter', v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value=",">Comma (,)</SelectItem>
                                <SelectItem value=";">Semicolon (;)</SelectItem>
                                <SelectItem value="\t">Tab</SelectItem>
                                <SelectItem value="|">Pipe (|)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={node.config.hasHeader !== false}
                            onCheckedChange={v => onChange('hasHeader', v)}
                        />
                        <Label>First row is header</Label>
                    </div>
                </>
            )}

            {sourceType === 'rest' && (
                <>
                    <div className="space-y-2">
                        <Label>Connection</Label>
                        <Select value={node.config.connectionCode || ''} onValueChange={v => onChange('connectionCode', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select connection" />
                            </SelectTrigger>
                            <SelectContent>
                                {connections.filter(c => c.type === 'http').map(c => (
                                    <SelectItem key={c.id} value={c.code}>{c.name || c.code}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Endpoint</Label>
                        <Input
                            value={node.config.endpoint || ''}
                            onChange={e => onChange('endpoint', e.target.value)}
                            placeholder="/api/data"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Method</Label>
                        <Select value={node.config.method || 'GET'} onValueChange={v => onChange('method', v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="POST">POST</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </>
            )}

            {sourceType === 'vendure-query' && (
                <>
                    <JsonConfigField
                        label="Filter"
                        value={node.config.filter || {}}
                        onChange={(v) => onChange('filter', v)}
                        placeholder='{"state": "PaymentSettled"}'
                        rows={4}
                    />
                    <div className="space-y-2">
                        <Label>Limit</Label>
                        <Input
                            type="number"
                            value={node.config.limit || ''}
                            onChange={e => onChange('limit', e.target.value ? parseInt(e.target.value) : undefined)}
                            placeholder="No limit"
                        />
                    </div>
                </>
            )}
        </div>
    );
}

// TRANSFORM SETTINGS

interface TransformSettingsProps {
    node: PipelineNode;
    onChange: (key: string, value: any) => void;
}

export function TransformSettings({ node, onChange }: TransformSettingsProps) {
    const transformType = node.config.adapterCode || 'map';

    return (
        <div className="space-y-4">
            <h4 className="font-medium">Transform Configuration</h4>

            <div className="space-y-2">
                <Label>Transform Type</Label>
                <Select value={transformType} onValueChange={v => onChange('adapterCode', v)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {NODE_CATALOG.transforms.map(t => (
                            <SelectItem key={t.type} value={t.type}>
                                <div className="flex items-center gap-2">
                                    <t.icon className="w-4 h-4" />
                                    {t.name}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {transformType === 'map' && (
                <FieldMappingEditor
                    mapping={node.config.mapping || {}}
                    onChange={m => onChange('mapping', m)}
                />
            )}

            {transformType === 'template' && (
                <div className="space-y-2">
                    <Label>Formula Expression</Label>
                    <Textarea
                        value={node.config.expression || ''}
                        onChange={e => onChange('expression', e.target.value)}
                        placeholder="price * 1.2"
                        className="font-mono text-sm"
                        rows={4}
                    />
                    <p className="text-xs text-muted-foreground">
                        Use field names directly. Supports: +, -, *, /, round(), uppercase(), lowercase(), concat()
                    </p>
                </div>
            )}

            {transformType === 'aggregate' && (
                <>
                    <div className="space-y-2">
                        <Label>Group By Fields</Label>
                        <Input
                            value={(node.config.groupBy || []).join(', ')}
                            onChange={e => onChange('groupBy', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                            placeholder="category, brand"
                        />
                    </div>
                    <JsonConfigField
                        label="Aggregations"
                        value={node.config.aggregations || {}}
                        onChange={(v) => onChange('aggregations', v)}
                        placeholder='{"totalPrice": "sum(price)", "avgPrice": "avg(price)"}'
                        rows={4}
                    />
                </>
            )}
        </div>
    );
}

// VALIDATE SETTINGS

interface ValidateSettingsProps {
    node: PipelineNode;
    schemas: Array<{ id: string; code: string; name: string }>;
    onChange: (key: string, value: any) => void;
}

export function ValidateSettings({ node, schemas, onChange }: ValidateSettingsProps) {
    return (
        <div className="space-y-4">
            <h4 className="font-medium">Validation Configuration</h4>

            <div className="space-y-2">
                <Label>Schema</Label>
                <Select value={node.config.schemaCode || ''} onValueChange={v => onChange('schemaCode', v)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select schema" />
                    </SelectTrigger>
                    <SelectContent>
                        {schemas.map(s => (
                            <SelectItem key={s.id} value={s.code}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Validation Mode</Label>
                <Select value={node.config.mode || 'strict'} onValueChange={v => onChange('mode', v)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="strict">Strict - Reject invalid records</SelectItem>
                        <SelectItem value="permissive">Permissive - Allow with warnings</SelectItem>
                        <SelectItem value="coerce">Coerce - Try to fix types</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex items-center gap-2">
                <Switch
                    checked={node.config.stopOnError !== false}
                    onCheckedChange={v => onChange('stopOnError', v)}
                />
                <Label>Stop pipeline on validation error</Label>
            </div>
        </div>
    );
}

// FILTER SETTINGS

interface FilterSettingsProps {
    node: PipelineNode;
    onChange: (key: string, value: any) => void;
}

export function FilterSettings({ node, onChange }: FilterSettingsProps) {
    return (
        <div className="space-y-4">
            <h4 className="font-medium">Filter Configuration</h4>

            <div className="space-y-2">
                <Label>Filter Conditions</Label>
                <ConditionBuilder
                    conditions={node.config.conditions || []}
                    onChange={c => onChange('conditions', c)}
                />
            </div>

            <div className="space-y-2">
                <Label>Logic</Label>
                <Select value={node.config.logic || 'AND'} onValueChange={v => onChange('logic', v)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="AND">All conditions must match (AND)</SelectItem>
                        <SelectItem value="OR">Any condition must match (OR)</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

// LOAD SETTINGS

interface LoadSettingsProps {
    node: PipelineNode;
    connections: Array<{ id: string; code: string; name: string; type: string }>;
    onChange: (key: string, value: any) => void;
}

export function LoadSettings({ node, connections, onChange }: LoadSettingsProps) {
    const loadType = node.config.adapterCode || 'productUpsert';

    return (
        <div className="space-y-4">
            <h4 className="font-medium">Destination Configuration</h4>

            <div className="space-y-2">
                <Label>Destination Type</Label>
                <Select value={loadType} onValueChange={v => onChange('adapterCode', v)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {NODE_CATALOG.destinations.map(d => (
                            <SelectItem key={d.type} value={d.type}>
                                <div className="flex items-center gap-2">
                                    <d.icon className="w-4 h-4" />
                                    {d.name}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {(loadType === 'productUpsert' || loadType === 'customerUpsert') && (
                <>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={node.config.updateExisting !== false}
                            onCheckedChange={v => onChange('updateExisting', v)}
                        />
                        <Label>Update existing records</Label>
                    </div>
                    <div className="space-y-2">
                        <Label>Match Field</Label>
                        <Input
                            value={node.config.matchField || 'sku'}
                            onChange={e => onChange('matchField', e.target.value)}
                            placeholder="sku"
                        />
                    </div>
                </>
            )}

            {loadType === 'http' && (
                <>
                    <div className="space-y-2">
                        <Label>Connection</Label>
                        <Select value={node.config.connectionCode || ''} onValueChange={v => onChange('connectionCode', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select connection" />
                            </SelectTrigger>
                            <SelectContent>
                                {connections.filter(c => c.type === 'http').map(c => (
                                    <SelectItem key={c.id} value={c.code}>{c.name || c.code}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Endpoint</Label>
                        <Input
                            value={node.config.endpoint || ''}
                            onChange={e => onChange('endpoint', e.target.value)}
                            placeholder="/api/import"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Method</Label>
                        <Select value={node.config.method || 'POST'} onValueChange={v => onChange('method', v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="POST">POST</SelectItem>
                                <SelectItem value="PUT">PUT</SelectItem>
                                <SelectItem value="PATCH">PATCH</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Batch Size</Label>
                        <Input
                            type="number"
                            value={node.config.batchSize || 10}
                            onChange={e => onChange('batchSize', parseInt(e.target.value) || 10)}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

// CONDITION SETTINGS

interface ConditionSettingsProps {
    node: PipelineNode;
    onChange: (key: string, value: any) => void;
}

export function ConditionSettings({ node, onChange }: ConditionSettingsProps) {
    return (
        <div className="space-y-4">
            <h4 className="font-medium">Condition Configuration</h4>

            <div className="space-y-2">
                <Label>Condition Expression</Label>
                <Input
                    value={node.config.expression || ''}
                    onChange={e => onChange('expression', e.target.value)}
                    placeholder="price > 100"
                />
                <p className="text-xs text-muted-foreground">
                    Records matching condition go to TRUE branch, others to FALSE branch
                </p>
            </div>
        </div>
    );
}

// HELPER COMPONENTS

function FieldMappingEditor({ mapping, onChange }: { mapping: Record<string, string>; onChange: (m: Record<string, string>) => void }) {
    const entries = Object.entries(mapping);

    const addMapping = () => {
        onChange({ ...mapping, '': '' });
    };

    const updateMapping = (oldKey: string, newKey: string, value: string) => {
        const newMapping = { ...mapping };
        if (oldKey !== newKey) {
            delete newMapping[oldKey];
        }
        newMapping[newKey] = value;
        onChange(newMapping);
    };

    const removeMapping = (key: string) => {
        const newMapping = { ...mapping };
        delete newMapping[key];
        onChange(newMapping);
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label>Field Mappings</Label>
                <Button variant="outline" size="sm" onClick={addMapping}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                </Button>
            </div>
            <div className="space-y-2">
                {entries.map(([key, value], idx) => (
                    <div key={idx} className="flex items-center gap-2">
                        <Input
                            value={key}
                            onChange={e => updateMapping(key, e.target.value, value)}
                            placeholder="Target field"
                            className="flex-1"
                        />
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <Input
                            value={value}
                            onChange={e => updateMapping(key, key, e.target.value)}
                            placeholder="Source expression"
                            className="flex-1 font-mono text-sm"
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeMapping(key)}>
                            <X className="w-3 h-3" />
                        </Button>
                    </div>
                ))}
                {entries.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No mappings defined. Click "Add" to create one.
                    </p>
                )}
            </div>
            <p className="text-xs text-muted-foreground">
                Use {'{{ fieldName }}'} syntax for field references. Supports filters: {'{{ price | multiply(100) }}'}
            </p>
        </div>
    );
}

function ConditionBuilder({ conditions, onChange }: { conditions: Condition[]; onChange: (c: Condition[]) => void }) {
    const addCondition = () => {
        onChange([...conditions, { field: '', operator: 'eq', value: '' }]);
    };

    const updateCondition = (idx: number, updates: Partial<Condition>) => {
        const newConditions = [...conditions];
        newConditions[idx] = { ...newConditions[idx], ...updates };
        onChange(newConditions);
    };

    const removeCondition = (idx: number) => {
        onChange(conditions.filter((_, i) => i !== idx));
    };

    return (
        <div className="space-y-2">
            {conditions.map((cond, idx) => (
                <div key={idx} className="flex items-center gap-2">
                    <Input
                        value={cond.field}
                        onChange={e => updateCondition(idx, { field: e.target.value })}
                        placeholder="Field"
                        className="w-28"
                    />
                    <Select value={cond.operator} onValueChange={v => updateCondition(idx, { operator: v })}>
                        <SelectTrigger className="w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="eq">equals</SelectItem>
                            <SelectItem value="neq">not equals</SelectItem>
                            <SelectItem value="gt">greater than</SelectItem>
                            <SelectItem value="gte">greater or equal</SelectItem>
                            <SelectItem value="lt">less than</SelectItem>
                            <SelectItem value="lte">less or equal</SelectItem>
                            <SelectItem value="contains">contains</SelectItem>
                            <SelectItem value="startsWith">starts with</SelectItem>
                            <SelectItem value="endsWith">ends with</SelectItem>
                            <SelectItem value="isNull">is null</SelectItem>
                            <SelectItem value="isNotNull">is not null</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        value={cond.value}
                        onChange={e => updateCondition(idx, { value: e.target.value })}
                        placeholder="Value"
                        className="flex-1"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeCondition(idx)}>
                        <X className="w-3 h-3" />
                    </Button>
                </div>
            ))}
            <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="w-3 h-3 mr-1" />
                Add Condition
            </Button>
        </div>
    );
}

/**
 * JSON Config Field with debounced validation
 */
interface JsonConfigFieldProps {
    label: string;
    value: unknown;
    onChange: (value: unknown) => void;
    placeholder?: string;
    rows?: number;
}

function JsonConfigField({ label, value, onChange, placeholder = '{}', rows = 4 }: JsonConfigFieldProps) {
    const [text, setText] = React.useState(() => {
        try {
            return JSON.stringify(value ?? {}, null, 2);
        } catch {
            return '{}';
        }
    });
    const [error, setError] = React.useState<string | null>(null);
    const [isPending, setIsPending] = React.useState(false);
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = React.useRef(true);

    React.useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    // Sync with external value changes
    React.useEffect(() => {
        try {
            const currentParsed = text.trim() ? JSON.parse(text) : {};
            if (JSON.stringify(currentParsed) !== JSON.stringify(value)) {
                setText(JSON.stringify(value ?? {}, null, 2));
                setError(null);
            }
        } catch {
            // Keep current text if comparison fails
        }
    }, [value]);

    const handleChange = (newText: string) => {
        setText(newText);
        setIsPending(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        timeoutRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            setIsPending(false);

            if (!newText.trim()) {
                setError(null);
                onChange({});
                return;
            }

            try {
                const parsed = JSON.parse(newText);
                setError(null);
                onChange(parsed);
            } catch (e) {
                const err = e as SyntaxError;
                let message = err.message.replace(/^JSON\.parse: /, '').replace(/^SyntaxError: /, '');
                const posMatch = message.match(/at position (\d+)/i);
                if (posMatch) {
                    const pos = parseInt(posMatch[1], 10);
                    const lines = newText.substring(0, pos).split('\n');
                    message = message.replace(/ at position \d+/, '').replace(/ in JSON at position \d+/, '');
                    setError(`Invalid JSON: ${message} (line ${lines.length}, col ${lines[lines.length - 1].length + 1})`);
                } else {
                    setError(`Invalid JSON: ${message}`);
                }
            }
        }, 300);
    };

    const getBorderClass = () => {
        if (error) return 'border-red-500 focus:border-red-500';
        if (isPending) return 'border-amber-400';
        return '';
    };

    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <Textarea
                value={text}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={placeholder}
                rows={rows}
                className={`font-mono text-sm ${getBorderClass()}`}
            />
            {error && (
                <div className="flex items-start gap-1.5 text-red-600">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <p className="text-xs">{error}</p>
                </div>
            )}
        </div>
    );
}

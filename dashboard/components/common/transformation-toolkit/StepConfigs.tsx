import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Badge,
    ScrollArea,
    Separator,
    Textarea,
} from '@vendure/dashboard';
import {
    Plus,
    ArrowRight,
    X,
    HelpCircle,
    Shuffle,
    Filter,
    Calculator,
} from 'lucide-react';
import { FORMULA_FUNCTIONS } from './constants';
import type {
    MapConfigProps,
    FilterConfigProps,
    FormulaConfigProps,
    AggregateConfigProps,
    FieldMapping,
    FilterCondition,
    FormulaField,
    AggregateConfig,
} from './types';

/** Filter operator type for type-safe operator selection */
type FilterOperator = FilterCondition['operator'];

/** Aggregation function type */
type AggregationFunction = AggregateConfig['aggregations'][number]['function'];

// MAP CONFIG

export function MapConfig({ config, onChange, fields }: MapConfigProps) {
    const mappings = config.mappings || [];

    const addMapping = () => {
        onChange({ ...config, mappings: [...mappings, { target: '', source: '', transform: '' }] });
    };

    const updateMapping = (idx: number, updates: Partial<FieldMapping>) => {
        const newMappings = [...mappings];
        newMappings[idx] = { ...newMappings[idx], ...updates };
        onChange({ ...config, mappings: newMappings });
    };

    const removeMapping = (idx: number) => {
        onChange({ ...config, mappings: mappings.filter((_, i) => i !== idx) });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label>Field Mappings</Label>
                <Button variant="outline" size="sm" onClick={addMapping}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Mapping
                </Button>
            </div>

            {mappings.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Shuffle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No field mappings defined</p>
                    <p className="text-sm">Click "Add Mapping" to start</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {mappings.map((mapping, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 border rounded-lg">
                            <Select
                                value={mapping.source || '__none__'}
                                onValueChange={v => updateMapping(idx, { source: v === '__none__' ? '' : v })}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Source field" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Select field...</SelectItem>
                                    {fields.map(f => (
                                        <SelectItem key={f} value={f}>{f}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <Input
                                value={mapping.target || ''}
                                onChange={e => updateMapping(idx, { target: e.target.value })}
                                placeholder="Target field name"
                                className="flex-1"
                            />
                            <Input
                                value={mapping.transform || ''}
                                onChange={e => updateMapping(idx, { transform: e.target.value })}
                                placeholder="Transform (optional)"
                                className="flex-1 font-mono text-sm"
                            />
                            <Button variant="ghost" size="icon" onClick={() => removeMapping(idx)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            <p className="text-xs text-muted-foreground">
                Use transform expressions like: <code>upper(value)</code>, <code>value * 100</code>, <code>concat(firstName, ' ', lastName)</code>
            </p>
        </div>
    );
}

// FILTER CONFIG

export function FilterConfig({ config, onChange, fields }: FilterConfigProps) {
    const conditions = config.conditions || [];

    const addCondition = () => {
        onChange({ ...config, conditions: [...conditions, { field: '', operator: 'eq', value: '' }] });
    };

    const updateCondition = (idx: number, updates: Partial<FilterCondition>) => {
        const newConditions = [...conditions];
        newConditions[idx] = { ...newConditions[idx], ...updates };
        onChange({ ...config, conditions: newConditions });
    };

    const removeCondition = (idx: number) => {
        onChange({ ...config, conditions: conditions.filter((_, i) => i !== idx) });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label>Filter Conditions</Label>
                <div className="flex items-center gap-2">
                    <Select
                        value={config.logic || 'AND'}
                        onValueChange={v => onChange({ ...config, logic: v })}
                    >
                        <SelectTrigger className="w-20">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="AND">AND</SelectItem>
                            <SelectItem value="OR">OR</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={addCondition}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add
                    </Button>
                </div>
            </div>

            {conditions.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No conditions - all rows pass through</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {conditions.map((cond, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                            {idx > 0 && (
                                <Badge variant="outline" className="w-12 justify-center flex-shrink-0">
                                    {config.logic || 'AND'}
                                </Badge>
                            )}
                            <Select
                                value={cond.field || '__none__'}
                                onValueChange={v => updateCondition(idx, { field: v === '__none__' ? '' : v })}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Field" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Select field...</SelectItem>
                                    {fields.map(f => (
                                        <SelectItem key={f} value={f}>{f}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={cond.operator}
                                onValueChange={v => updateCondition(idx, { operator: v as FilterOperator })}
                            >
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
                                    <SelectItem value="in">in list</SelectItem>
                                    <SelectItem value="notIn">not in list</SelectItem>
                                    <SelectItem value="isNull">is null</SelectItem>
                                    <SelectItem value="isNotNull">is not null</SelectItem>
                                    <SelectItem value="regex">matches regex</SelectItem>
                                </SelectContent>
                            </Select>
                            {!['isNull', 'isNotNull'].includes(cond.operator) && (
                                <Input
                                    value={cond.value}
                                    onChange={e => updateCondition(idx, { value: e.target.value })}
                                    placeholder="Value"
                                    className="flex-1"
                                />
                            )}
                            <Button variant="ghost" size="icon" onClick={() => removeCondition(idx)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// FORMULA CONFIG

export function FormulaConfig({ config, onChange, fields }: FormulaConfigProps) {
    const formulas = config.formulas || [];
    const [showHelp, setShowHelp] = React.useState(false);

    const addFormula = () => {
        onChange({ ...config, formulas: [...formulas, { field: '', expression: '' }] });
    };

    const updateFormula = (idx: number, updates: Partial<FormulaField>) => {
        const newFormulas = [...formulas];
        newFormulas[idx] = { ...newFormulas[idx], ...updates };
        onChange({ ...config, formulas: newFormulas });
    };

    const removeFormula = (idx: number) => {
        onChange({ ...config, formulas: formulas.filter((_, i) => i !== idx) });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label>Calculated Fields</Label>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowHelp(!showHelp)}>
                        <HelpCircle className="w-4 h-4 mr-2" />
                        Functions
                    </Button>
                    <Button variant="outline" size="sm" onClick={addFormula}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add
                    </Button>
                </div>
            </div>

            {showHelp && (
                <Card>
                    <CardContent className="p-4">
                        <ScrollArea className="h-[200px]">
                            <div className="space-y-4">
                                {FORMULA_FUNCTIONS.map(category => (
                                    <div key={category.category}>
                                        <h5 className="font-medium text-sm mb-2">{category.category}</h5>
                                        <div className="grid grid-cols-2 gap-2">
                                            {category.functions.map(fn => (
                                                <div key={fn.name} className="text-xs">
                                                    <code className="text-primary">{fn.name}</code>
                                                    <span className="text-muted-foreground ml-2">{fn.description}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            )}

            {formulas.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Calculator className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No formulas defined</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {formulas.map((formula, idx) => (
                        <div key={idx} className="p-3 border rounded-lg space-y-2">
                            <div className="flex items-center gap-2">
                                <Input
                                    value={formula.field}
                                    onChange={e => updateFormula(idx, { field: e.target.value })}
                                    placeholder="Output field name"
                                    className="flex-1"
                                />
                                <Button variant="ghost" size="icon" onClick={() => removeFormula(idx)}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                            <Textarea
                                value={formula.expression}
                                onChange={e => updateFormula(idx, { expression: e.target.value })}
                                placeholder="Expression: price * quantity, upper(name), if(active, 'Yes', 'No')"
                                className="font-mono text-sm"
                                rows={2}
                            />
                        </div>
                    ))}
                </div>
            )}

            <p className="text-xs text-muted-foreground">
                Reference fields by name. Examples: <code>price * 1.2</code>, <code>concat(firstName, ' ', lastName)</code>
            </p>
        </div>
    );
}

// AGGREGATE CONFIG

export function AggregateConfig({ config, onChange, fields }: AggregateConfigProps) {
    const groupBy = config.groupBy || [];
    const aggregations = config.aggregations || [];

    const addAggregation = () => {
        onChange({
            ...config,
            aggregations: [...aggregations, { field: '', function: 'count', alias: '' }],
        });
    };

    const updateAggregation = (idx: number, updates: Partial<typeof aggregations[0]>) => {
        const newAggs = [...aggregations];
        newAggs[idx] = { ...newAggs[idx], ...updates };
        onChange({ ...config, aggregations: newAggs });
    };

    const removeAggregation = (idx: number) => {
        onChange({ ...config, aggregations: aggregations.filter((_, i) => i !== idx) });
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Group By Fields</Label>
                <div className="flex flex-wrap gap-2">
                    {fields.map(f => (
                        <Badge
                            key={f}
                            variant={groupBy.includes(f) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => {
                                const newGroupBy = groupBy.includes(f)
                                    ? groupBy.filter(g => g !== f)
                                    : [...groupBy, f];
                                onChange({ ...config, groupBy: newGroupBy });
                            }}
                        >
                            {f}
                        </Badge>
                    ))}
                </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
                <Label>Aggregations</Label>
                <Button variant="outline" size="sm" onClick={addAggregation}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                </Button>
            </div>

            {aggregations.map((agg, idx) => (
                <div key={idx} className="flex items-center gap-2">
                    <Select
                        value={agg.function}
                        onValueChange={v => updateAggregation(idx, { function: v as AggregationFunction })}
                    >
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="count">COUNT</SelectItem>
                            <SelectItem value="sum">SUM</SelectItem>
                            <SelectItem value="avg">AVG</SelectItem>
                            <SelectItem value="min">MIN</SelectItem>
                            <SelectItem value="max">MAX</SelectItem>
                            <SelectItem value="first">FIRST</SelectItem>
                            <SelectItem value="last">LAST</SelectItem>
                            <SelectItem value="concat">CONCAT</SelectItem>
                        </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">(</span>
                    <Select
                        value={agg.field || '*'}
                        onValueChange={v => updateAggregation(idx, { field: v === '*' ? '' : v })}
                    >
                        <SelectTrigger className="flex-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="*">*</SelectItem>
                            {fields.map(f => (
                                <SelectItem key={f} value={f}>{f}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">)</span>
                    <span className="text-muted-foreground">AS</span>
                    <Input
                        value={agg.alias}
                        onChange={e => updateAggregation(idx, { alias: e.target.value })}
                        placeholder="alias"
                        className="w-32"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeAggregation(idx)}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            ))}
        </div>
    );
}

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
    Badge,
} from '@vendure/dashboard';
import { Plus, X, ArrowRight, Settings } from 'lucide-react';
import { MapConfig, FilterConfig, FormulaConfig, AggregateConfig } from './StepConfigs';
import type { StepEditorProps } from './types';

export function StepEditor({ step, onChange, fields }: StepEditorProps) {
    const handleConfigChange = (config: any) => {
        onChange({ ...step, config });
    };

    switch (step.type) {
        case 'map':
        case 'rename':
            return <MapConfig config={step.config} onChange={handleConfigChange} fields={fields} />;
        case 'filter':
            return <FilterConfig config={step.config} onChange={handleConfigChange} fields={fields} />;
        case 'formula':
            return <FormulaConfig config={step.config} onChange={handleConfigChange} fields={fields} />;
        case 'aggregate':
            return <AggregateConfig config={step.config} onChange={handleConfigChange} fields={fields} />;
        case 'sort':
            return (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Sort Field</Label>
                        <Select
                            value={step.config.field || '__none__'}
                            onValueChange={v => handleConfigChange({ ...step.config, field: v === '__none__' ? '' : v })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select field" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">Select field...</SelectItem>
                                {fields.map(f => (
                                    <SelectItem key={f} value={f}>{f}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-4">
                        <Label>Direction</Label>
                        <div className="flex gap-2">
                            <Button
                                variant={step.config.direction !== 'desc' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handleConfigChange({ ...step.config, direction: 'asc' })}
                            >
                                Ascending
                            </Button>
                            <Button
                                variant={step.config.direction === 'desc' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handleConfigChange({ ...step.config, direction: 'desc' })}
                            >
                                Descending
                            </Button>
                        </div>
                    </div>
                </div>
            );
        case 'dedupe':
            return (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Deduplicate By Fields</Label>
                        <p className="text-xs text-muted-foreground">Select fields that determine uniqueness</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {fields.map(f => {
                            const selected = (step.config.fields || []).includes(f);
                            return (
                                <Badge
                                    key={f}
                                    variant={selected ? 'default' : 'outline'}
                                    className="cursor-pointer"
                                    onClick={() => {
                                        const currentFields = step.config.fields || [];
                                        const newFields = selected
                                            ? currentFields.filter((x: string) => x !== f)
                                            : [...currentFields, f];
                                        handleConfigChange({ ...step.config, fields: newFields });
                                    }}
                                >
                                    {f}
                                </Badge>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={step.config.keepFirst !== false}
                            onCheckedChange={v => handleConfigChange({ ...step.config, keepFirst: v })}
                        />
                        <Label>Keep first occurrence (uncheck to keep last)</Label>
                    </div>
                </div>
            );
        case 'typecast':
            return (
                <div className="space-y-4">
                    <Label>Type Conversions</Label>
                    {(step.config.casts || []).map((cast: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2">
                            <Select
                                value={cast.field || '__none__'}
                                onValueChange={v => {
                                    const newCasts = [...(step.config.casts || [])];
                                    newCasts[idx] = { ...cast, field: v === '__none__' ? '' : v };
                                    handleConfigChange({ ...step.config, casts: newCasts });
                                }}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Field" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Select...</SelectItem>
                                    {fields.map(f => (
                                        <SelectItem key={f} value={f}>{f}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <ArrowRight className="w-4 h-4" />
                            <Select
                                value={cast.type || 'string'}
                                onValueChange={v => {
                                    const newCasts = [...(step.config.casts || [])];
                                    newCasts[idx] = { ...cast, type: v };
                                    handleConfigChange({ ...step.config, casts: newCasts });
                                }}
                            >
                                <SelectTrigger className="w-32">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="string">String</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="boolean">Boolean</SelectItem>
                                    <SelectItem value="date">Date</SelectItem>
                                    <SelectItem value="array">Array</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="ghost" size="icon" onClick={() => {
                                const newCasts = step.config.casts.filter((_: any, i: number) => i !== idx);
                                handleConfigChange({ ...step.config, casts: newCasts });
                            }}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => {
                        handleConfigChange({
                            ...step.config,
                            casts: [...(step.config.casts || []), { field: '', type: 'string' }],
                        });
                    }}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Type Cast
                    </Button>
                </div>
            );
        default:
            return (
                <div className="text-center py-6 text-muted-foreground">
                    <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Configuration for {step.type} coming soon</p>
                </div>
            );
    }
}

export default StepEditor;

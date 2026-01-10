/**
 * Export Wizard - Source Step Component
 * Handles source entity selection and query configuration
 */

import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Badge,
} from '@vendure/dashboard';
import {
    Check,
    Plus,
    Trash2,
} from 'lucide-react';
import { VENDURE_ENTITY_LIST, VENDURE_ENTITY_SCHEMAS } from '../../../../vendure-schemas/vendure-entity-schemas';
import type { ExportConfiguration, QueryType, FilterOperator } from './types';

interface SourceStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

export function SourceStep({ config, updateConfig }: SourceStepProps) {
    const query = config.sourceQuery ?? { type: 'all' };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Select Data Source</h2>
                <p className="text-muted-foreground">
                    Choose which Vendure entity to export
                </p>
            </div>

            {/* Entity Selection */}
            <EntitySelection config={config} updateConfig={updateConfig} />

            {/* Query Configuration */}
            {config.sourceEntity && (
                <QueryConfiguration config={config} updateConfig={updateConfig} query={query} />
            )}
        </div>
    );
}

interface EntitySelectionProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function EntitySelection({ config, updateConfig }: EntitySelectionProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {VENDURE_ENTITY_LIST.map(entity => {
                const isSelected = config.sourceEntity === entity.code;
                const schema = VENDURE_ENTITY_SCHEMAS[entity.code];
                const fieldCount = schema ? Object.keys(schema.fields).length : 0;

                return (
                    <button
                        key={entity.code}
                        className={`p-4 border rounded-lg text-left transition-all ${
                            isSelected
                                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                : 'hover:border-primary/50'
                        }`}
                        onClick={() => updateConfig({ sourceEntity: entity.code })}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{entity.name}</span>
                            {isSelected && <Check className="w-4 h-4 text-primary" />}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                            {entity.description}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                            {fieldCount} fields
                        </Badge>
                    </button>
                );
            })}
        </div>
    );
}

interface QueryConfigurationProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    query: NonNullable<ExportConfiguration['sourceQuery']>;
}

function QueryConfiguration({ config, updateConfig, query }: QueryConfigurationProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Query Options</CardTitle>
                <CardDescription>Configure how to fetch data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <Label>Query Type</Label>
                        <Select
                            value={query.type}
                            onValueChange={type => updateConfig({
                                sourceQuery: { ...query, type: type as QueryType },
                            })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Records</SelectItem>
                                <SelectItem value="query">With Filters</SelectItem>
                                <SelectItem value="graphql">Custom GraphQL</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label>Limit</Label>
                        <Input
                            type="number"
                            value={query.limit ?? 10000}
                            onChange={e => updateConfig({
                                sourceQuery: { ...query, limit: parseInt(e.target.value) || 10000 },
                            })}
                        />
                    </div>

                    <div>
                        <Label>Order By</Label>
                        <Select
                            value={query.orderBy ?? 'id'}
                            onValueChange={orderBy => updateConfig({
                                sourceQuery: { ...query, orderBy },
                            })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {config.sourceEntity && VENDURE_ENTITY_SCHEMAS[config.sourceEntity] &&
                                    Object.keys(VENDURE_ENTITY_SCHEMAS[config.sourceEntity].fields).map(field => (
                                        <SelectItem key={field} value={field}>{field}</SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Filters */}
                {query.type === 'query' && (
                    <FiltersEditor config={config} updateConfig={updateConfig} />
                )}
            </CardContent>
        </Card>
    );
}

interface FiltersEditorProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function FiltersEditor({ config, updateConfig }: FiltersEditorProps) {
    return (
        <div>
            <Label className="mb-2 block">Filters</Label>
            <div className="space-y-2">
                {(config.filters ?? []).map((filter, index) => (
                    <div key={index} className="flex gap-2 items-center">
                        <Select
                            value={filter.field}
                            onValueChange={field => {
                                const newFilters = [...(config.filters ?? [])];
                                newFilters[index] = { ...filter, field };
                                updateConfig({ filters: newFilters });
                            }}
                        >
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="Field" />
                            </SelectTrigger>
                            <SelectContent>
                                {config.sourceEntity && VENDURE_ENTITY_SCHEMAS[config.sourceEntity] &&
                                    Object.keys(VENDURE_ENTITY_SCHEMAS[config.sourceEntity].fields).map(field => (
                                        <SelectItem key={field} value={field}>{field}</SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>

                        <Select
                            value={filter.operator}
                            onValueChange={operator => {
                                const newFilters = [...(config.filters ?? [])];
                                newFilters[index] = { ...filter, operator: operator as FilterOperator };
                                updateConfig({ filters: newFilters });
                            }}
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
                                <SelectItem value="isNull">is null</SelectItem>
                                <SelectItem value="isNotNull">is not null</SelectItem>
                            </SelectContent>
                        </Select>

                        {!['isNull', 'isNotNull'].includes(filter.operator) && (
                            <Input
                                value={String(filter.value ?? '')}
                                onChange={e => {
                                    const newFilters = [...(config.filters ?? [])];
                                    newFilters[index] = { ...filter, value: e.target.value };
                                    updateConfig({ filters: newFilters });
                                }}
                                placeholder="Value"
                                className="flex-1"
                            />
                        )}

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                updateConfig({
                                    filters: (config.filters ?? []).filter((_, i) => i !== index),
                                });
                            }}
                        >
                            <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                    </div>
                ))}

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        updateConfig({
                            filters: [
                                ...(config.filters ?? []),
                                { field: '', operator: 'eq', value: '' },
                            ],
                        });
                    }}
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Filter
                </Button>
            </div>
        </div>
    );
}

export default SourceStep;

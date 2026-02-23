import { useMemo } from 'react';
import {
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
} from '@vendure/dashboard';
import { VENDURE_ENTITY_SCHEMAS } from '../../../../shared';
import { QUERY_LIMITS } from '../../../constants';
import { useEntityFieldSchemas, useQueryTypeOptions } from '../../../hooks/api';
import { WizardStepContainer } from '../shared';
import { EntitySelector } from '../../shared/entity-selector';
import { FilterConditionsEditor } from '../../shared/filter-conditions-editor';
import { STEP_CONTENT } from './constants';
import type { ExportConfiguration, QueryType } from './types';

interface SourceStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function SourceStep({ config, updateConfig, errors = {} }: SourceStepProps) {
    const query = config.sourceQuery ?? { type: 'all' };

    return (
        <WizardStepContainer
            title={STEP_CONTENT.source.title}
            description={STEP_CONTENT.source.description}
        >
            <EntitySelector
                value={config.sourceEntity}
                onChange={(entityCode) => updateConfig({ sourceEntity: entityCode })}
            />

            {config.sourceEntity && (
                <QueryConfiguration config={config} updateConfig={updateConfig} query={query} />
            )}
        </WizardStepContainer>
    );
}

/**
 * Resolve entity field names dynamically from the backend, falling back
 * to the static VENDURE_ENTITY_SCHEMAS while the query is loading or
 * if the entity is not known to the backend.
 */
function useEntityFields(entityCode: string | undefined): string[] {
    const { getFieldNames, isLoading } = useEntityFieldSchemas();

    return useMemo(() => {
        if (!entityCode) return [];
        // Try dynamic fields from backend first
        const dynamicFields = getFieldNames(entityCode);
        if (dynamicFields.length > 0) return dynamicFields;
        // Fall back to static schemas while loading or for unknown entities
        const staticSchema = VENDURE_ENTITY_SCHEMAS[entityCode];
        if (staticSchema) return Object.keys(staticSchema.fields);
        return [];
    }, [entityCode, getFieldNames]);
}

interface QueryConfigurationProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    query: NonNullable<ExportConfiguration['sourceQuery']>;
}

function QueryConfiguration({ config, updateConfig, query }: QueryConfigurationProps) {
    const entityFields = useEntityFields(config.sourceEntity);
    const { options: queryTypeOptions } = useQueryTypeOptions();

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
                                {queryTypeOptions.map(option => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label>Limit</Label>
                        <Input
                            type="number"
                            value={query.limit ?? QUERY_LIMITS.EXPORT_DEFAULT}
                            onChange={e => updateConfig({
                                sourceQuery: { ...query, limit: parseInt(e.target.value) || QUERY_LIMITS.EXPORT_DEFAULT },
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
                                {entityFields.map(field => (
                                    <SelectItem key={field} value={field}>{field}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {query.type === 'query' && config.sourceEntity && (
                    <FilterConditionsEditor
                        conditions={config.filters ?? []}
                        onChange={(filters) => updateConfig({ filters })}
                        fields={entityFields}
                        showLogicSelector={false}
                        fieldPlaceholder="Select field..."
                        valuePlaceholder="Value"
                        emptyMessage="No filters - all records will be exported"
                        addLabel="Add Filter"
                    />
                )}
            </CardContent>
        </Card>
    );
}

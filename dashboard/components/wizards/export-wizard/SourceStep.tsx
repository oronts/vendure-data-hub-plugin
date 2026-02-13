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
import { VENDURE_ENTITY_SCHEMAS } from '../../../../shared/vendure-schemas';
import { QUERY_LIMITS } from '../../../constants';
import { WizardStepContainer } from '../shared';
import { EntitySelector } from '../../shared/entity-selector';
import { FilterConditionsEditor } from '../../shared/filter-conditions-editor';
import { STEP_CONTENT } from './constants';
import type { ExportConfiguration, QueryType } from './types';
import type { FilterCondition, FilterOperator } from '../../../types';

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
                                {config.sourceEntity && VENDURE_ENTITY_SCHEMAS[config.sourceEntity] &&
                                    Object.keys(VENDURE_ENTITY_SCHEMAS[config.sourceEntity].fields).map(field => (
                                        <SelectItem key={field} value={field}>{field}</SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                                {query.type === 'query' && config.sourceEntity && (
                    <FilterConditionsEditor
                        conditions={config.filters ?? []}
                        onChange={(filters) => updateConfig({ filters })}
                        fields={
                            VENDURE_ENTITY_SCHEMAS[config.sourceEntity]
                                ? Object.keys(VENDURE_ENTITY_SCHEMAS[config.sourceEntity].fields)
                                : []
                        }
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

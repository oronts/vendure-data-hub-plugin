import { useMemo } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import { useExportEntitySchemas, useQueryTypeOptions } from '../../../hooks/api';
import { WizardStepContainer } from '../shared';
import { ExportEntitySelector } from '../../shared/entity-selector';
import { FilterConditionsEditor } from '../../shared/filter-conditions-editor';
import type { ExportConfiguration, QueryType } from './types';

interface SourceStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

export function SourceStep({ config, updateConfig }: SourceStepProps) {
    const { t } = useLingui();
    const query = config.sourceQuery ?? { type: 'all' };

    return (
        <WizardStepContainer
            title={t`Select Data Source`}
            description={t`Choose which Vendure entity to export`}
        >
            <ExportEntitySelector
                value={config.sourceEntity}
                onChange={(entityCode) =>
                    updateConfig({ sourceEntity: entityCode })
                }
            />

            {config.sourceEntity && (
                <QueryConfiguration
                    config={config}
                    updateConfig={updateConfig}
                    query={query}
                />
            )}
        </WizardStepContainer>
    );
}

function useEntityFields(entityCode: string | undefined): string[] {
    const { getQueryFieldNames } = useExportEntitySchemas();

    return useMemo(() => {
        if (!entityCode) return [];
        return getQueryFieldNames(entityCode);
    }, [entityCode, getQueryFieldNames]);
}

interface QueryConfigurationProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    query: NonNullable<ExportConfiguration['sourceQuery']>;
}

function QueryConfiguration({
    config,
    updateConfig,
    query,
}: QueryConfigurationProps) {
    const { t } = useLingui();
    const entityFields = useEntityFields(config.sourceEntity);
    const { options: queryTypeOptions } = useQueryTypeOptions();

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    <Trans>Query Options</Trans>
                </CardTitle>
                <CardDescription>
                    <Trans>Configure how to fetch data</Trans>
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <Label htmlFor="export-query-type">
                            <Trans>Query Type</Trans>
                        </Label>
                        <Select
                            value={query.type}
                            onValueChange={(type) =>
                                updateConfig({
                                    sourceQuery: {
                                        ...query,
                                        type: type as QueryType,
                                    },
                                })
                            }
                        >
                            <SelectTrigger id="export-query-type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {queryTypeOptions.map((option) => (
                                    <SelectItem
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label htmlFor="export-order-by">
                            <Trans>Order By</Trans>
                        </Label>
                        <Select
                            value={query.orderBy ?? 'id'}
                            onValueChange={(orderBy) => {
                                if (orderBy == null) return;
                                updateConfig({
                                    sourceQuery: { ...query, orderBy },
                                });
                            }}
                        >
                            <SelectTrigger id="export-order-by">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {entityFields.map((field) => (
                                    <SelectItem key={field} value={field}>
                                        {field}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label htmlFor="export-order-direction">
                            <Trans>Direction</Trans>
                        </Label>
                        <Select
                            value={query.orderDirection ?? 'ASC'}
                            onValueChange={(orderDirection) =>
                                updateConfig({
                                    sourceQuery: {
                                        ...query,
                                        orderDirection: orderDirection as
                                            'ASC' | 'DESC',
                                    },
                                })
                            }
                        >
                            <SelectTrigger id="export-order-direction">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ASC">
                                    <Trans>Ascending</Trans>
                                </SelectItem>
                                <SelectItem value="DESC">
                                    <Trans>Descending</Trans>
                                </SelectItem>
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
                        fieldPlaceholder={t`Select field...`}
                        valuePlaceholder={t`Value`}
                        emptyMessage={t`No filters - all records will be exported`}
                        addLabel={t`Add Filter`}
                        allowedOperators={[
                            'eq',
                            'ne',
                            'gt',
                            'gte',
                            'lt',
                            'lte',
                            'in',
                            'contains',
                        ]}
                    />
                )}
            </CardContent>
        </Card>
    );
}

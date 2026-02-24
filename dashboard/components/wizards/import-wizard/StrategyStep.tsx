import { useCallback, memo } from 'react';
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
    Switch,
    Badge,
} from '@vendure/dashboard';
import { WizardStepContainer } from '../shared';
import type { ImportConfiguration, ImportStrategies } from './types';
import { UI_DEFAULTS } from '../../../constants';
import { useOptionValues, type ConfigOptionValue } from '../../../hooks/api/use-config-options';
import { STEP_CONTENT, DEFAULT_IMPORT_STRATEGIES } from './constants';

type CleanupStrategy = ImportStrategies['cleanupStrategy'];

interface StrategyStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function StrategyStep({ config, updateConfig, errors = {} }: StrategyStepProps) {
    const strategies = config.strategies ?? { ...DEFAULT_IMPORT_STRATEGIES };
    const primaryKeyFields = config.targetSchema?.primaryKey
        ? (Array.isArray(config.targetSchema.primaryKey)
            ? config.targetSchema.primaryKey
            : [config.targetSchema.primaryKey])
        : [];

    const { options: existingRecordOptions } = useOptionValues('loadStrategies');
    const { options: cleanupOptions } = useOptionValues('cleanupStrategies');
    const { options: recordOptions } = useOptionValues('newRecordStrategies');

    return (
        <WizardStepContainer
            title={STEP_CONTENT.strategy.title}
            description={STEP_CONTENT.strategy.description}
        >
            <LookupFieldsCard
                config={config}
                updateConfig={updateConfig}
                strategies={strategies}
                primaryKeyFields={primaryKeyFields}
            />
            <ExistingRecordsCard strategies={strategies} updateConfig={updateConfig} options={existingRecordOptions} />
            <NewRecordsCard strategies={strategies} updateConfig={updateConfig} options={recordOptions} />
            <AdvancedOptionsCard strategies={strategies} updateConfig={updateConfig} cleanupOptions={cleanupOptions} />
        </WizardStepContainer>
    );
}

interface LookupFieldsCardProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    strategies: ImportConfiguration['strategies'];
    primaryKeyFields: string[];
}

function LookupFieldsCard({ config, updateConfig, strategies, primaryKeyFields }: LookupFieldsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Record Lookup</CardTitle>
                <CardDescription>
                    Which fields should be used to find existing records?
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label className="mb-2 block">Lookup Fields (for matching existing records)</Label>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Lookup field selection">
                        {config.targetSchema && Object.keys(config.targetSchema.fields).map(field => (
                            <LookupFieldButton
                                key={field}
                                field={field}
                                strategies={strategies}
                                primaryKeyFields={primaryKeyFields}
                                updateConfig={updateConfig}
                            />
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Selected: {strategies.lookupFields.join(', ') || 'None'}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

interface LookupFieldButtonProps {
    field: string;
    strategies: ImportConfiguration['strategies'];
    primaryKeyFields: string[];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

const LookupFieldButton = memo(function LookupFieldButton({
    field,
    strategies,
    primaryKeyFields,
    updateConfig,
}: LookupFieldButtonProps) {
    const isSelected = strategies.lookupFields.includes(field);
    const isPrimaryKey = primaryKeyFields.includes(field);

    const handleClick = useCallback(() => {
        const newFields = isSelected
            ? strategies.lookupFields.filter(f => f !== field)
            : [...strategies.lookupFields, field];
        updateConfig({
            strategies: { ...strategies, lookupFields: newFields },
        });
    }, [field, isSelected, strategies, updateConfig]);

    return (
        <Button
            variant={isSelected ? 'default' : 'outline'}
            size="sm"
            onClick={handleClick}
            aria-pressed={isSelected}
            aria-label={`${isSelected ? 'Remove' : 'Add'} ${field} as lookup field${isPrimaryKey ? ' (primary key)' : ''}`}
            data-testid={`datahub-wizard-lookup-field-${field}-btn`}
        >
            {field}
            {isPrimaryKey && <Badge variant="secondary" className="ml-1 text-[10px]">PK</Badge>}
        </Button>
    );
});

interface ExistingRecordsCardProps {
    strategies: ImportConfiguration['strategies'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    options: ConfigOptionValue[];
}

function ExistingRecordsCard({ strategies, updateConfig, options }: ExistingRecordsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Existing Records</CardTitle>
                <CardDescription>What to do when a record already exists</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3" role="group" aria-label="Existing records strategy options">
                    {options.map(option => (
                        <StrategyOptionButton
                            key={option.value}
                            option={option}
                            isSelected={strategies.existingRecords === option.value}
                            strategies={strategies}
                            updateConfig={updateConfig}
                            strategyKey="existingRecords"
                            testIdPrefix="existing"
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

interface NewRecordsCardProps {
    strategies: ImportConfiguration['strategies'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    options: ConfigOptionValue[];
}

function NewRecordsCard({ strategies, updateConfig, options }: NewRecordsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>New Records</CardTitle>
                <CardDescription>What to do with records that don't exist yet</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3" role="group" aria-label="New records strategy options">
                    {options.map(option => (
                        <StrategyOptionButton
                            key={option.value}
                            option={option}
                            isSelected={strategies.newRecords === option.value}
                            strategies={strategies}
                            updateConfig={updateConfig}
                            strategyKey="newRecords"
                            testIdPrefix="new"
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

interface StrategyOptionButtonProps {
    option: { value: string; label: string };
    isSelected: boolean;
    strategies: ImportConfiguration['strategies'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    strategyKey: 'existingRecords' | 'newRecords';
    testIdPrefix: string;
}

const StrategyOptionButton = memo(function StrategyOptionButton({
    option,
    isSelected,
    strategies,
    updateConfig,
    strategyKey,
    testIdPrefix,
}: StrategyOptionButtonProps) {
    const handleClick = useCallback(() => {
        updateConfig({
            strategies: { ...strategies, [strategyKey]: option.value },
        });
    }, [option.value, strategies, strategyKey, updateConfig]);

    return (
        <Button
            variant={isSelected ? 'default' : 'outline'}
            className="h-auto p-3 justify-start"
            onClick={handleClick}
            aria-pressed={isSelected}
            aria-label={`${option.label} strategy for ${testIdPrefix} records`}
            data-testid={`datahub-wizard-strategy-${testIdPrefix}-${option.value}-btn`}
        >
            <span className="font-medium">{option.label}</span>
        </Button>
    );
});

interface AdvancedOptionsCardProps {
    strategies: ImportConfiguration['strategies'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    cleanupOptions: ConfigOptionValue[];
}

function AdvancedOptionsCard({ strategies, updateConfig, cleanupOptions }: AdvancedOptionsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Advanced Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="strategy-batch-size">Batch Size</Label>
                        <Input
                            id="strategy-batch-size"
                            type="number"
                            value={strategies.batchSize}
                            onChange={e => updateConfig({
                                strategies: { ...strategies, batchSize: parseInt(e.target.value) || UI_DEFAULTS.IMPORT_BATCH_SIZE },
                            })}
                        />
                    </div>
                    <div>
                        <Label htmlFor="strategy-error-threshold">Error Threshold (%)</Label>
                        <Input
                            id="strategy-error-threshold"
                            type="number"
                            value={strategies.errorThreshold}
                            onChange={e => updateConfig({
                                strategies: { ...strategies, errorThreshold: parseInt(e.target.value) || UI_DEFAULTS.DEFAULT_ERROR_THRESHOLD_PERCENT },
                            })}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Switch
                            id="publish-after-import"
                            checked={strategies.publishAfterImport}
                            onCheckedChange={publishAfterImport => updateConfig({
                                strategies: { ...strategies, publishAfterImport },
                            })}
                        />
                        <Label htmlFor="publish-after-import">Publish after import</Label>
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch
                            id="continue-on-error"
                            checked={strategies.continueOnError}
                            onCheckedChange={continueOnError => updateConfig({
                                strategies: { ...strategies, continueOnError },
                            })}
                        />
                        <Label htmlFor="continue-on-error">Continue on error</Label>
                    </div>
                </div>

                <div>
                    <Label>Cleanup Strategy</Label>
                    <Select
                        value={strategies.cleanupStrategy}
                        onValueChange={cleanupStrategy => updateConfig({
                            strategies: { ...strategies, cleanupStrategy: cleanupStrategy as CleanupStrategy },
                        })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {cleanupOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
}

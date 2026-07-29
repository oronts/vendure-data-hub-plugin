import { useCallback, memo } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Input,
    Label,
    Switch,
    Badge,
} from '@vendure/dashboard';
import { WizardStepContainer } from '../shared';
import type { ImportConfiguration } from './types';
import { UI_DEFAULTS } from '../../../constants';
import { useWizardStrategyMappings } from '../../../hooks/api/use-config-options';
import type { WizardStrategyMapping } from '../../../types/wizard';
import { DEFAULT_IMPORT_STRATEGIES } from './constants';

interface StrategyStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

export function StrategyStep({ config, updateConfig }: StrategyStepProps) {
    const { t } = useLingui();
    const strategies = config.strategies ?? { ...DEFAULT_IMPORT_STRATEGIES };
    const primaryKeyFields = config.targetSchema?.primaryKey
        ? Array.isArray(config.targetSchema.primaryKey)
            ? config.targetSchema.primaryKey
            : [config.targetSchema.primaryKey]
        : [];

    const { mappings: existingRecordOptions } = useWizardStrategyMappings();

    return (
        <WizardStepContainer
            title={t`Configure import strategy`}
            description={t`Define how records are matched, updated, and processed.`}
        >
            <LookupFieldsCard
                config={config}
                updateConfig={updateConfig}
                strategies={strategies}
                primaryKeyFields={primaryKeyFields}
            />
            <ExistingRecordsCard
                strategies={strategies}
                updateConfig={updateConfig}
                options={existingRecordOptions}
            />
            <AdvancedOptionsCard
                strategies={strategies}
                updateConfig={updateConfig}
            />
        </WizardStepContainer>
    );
}

interface LookupFieldsCardProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    strategies: ImportConfiguration['strategies'];
    primaryKeyFields: string[];
}

function LookupFieldsCard({
    config,
    updateConfig,
    strategies,
    primaryKeyFields,
}: LookupFieldsCardProps) {
    const { t } = useLingui();

    return (
        <Card>
            <CardHeader>
                <CardTitle><Trans>Record lookup</Trans></CardTitle>
                <CardDescription>
                    <Trans>Which fields should be used to find existing records?</Trans>
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label id="import-strategy-lookup-fields-label" className="mb-2 block">
                        <Trans>Lookup fields (for matching existing records)</Trans>
                    </Label>
                    <div
                        className="flex flex-wrap gap-2"
                        role="group"
                        aria-labelledby="import-strategy-lookup-fields-label"
                    >
                        {config.targetSchema &&
                            Object.keys(config.targetSchema.fields).map(
                                (field) => (
                                    <LookupFieldButton
                                        key={field}
                                        field={field}
                                        strategies={strategies}
                                        primaryKeyFields={primaryKeyFields}
                                        updateConfig={updateConfig}
                                    />
                                ),
                            )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        <Trans>Selected</Trans>:{' '}
                        {strategies.lookupFields.join(', ') || t`None`}
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
    const { t } = useLingui();
    const isSelected = strategies.lookupFields.includes(field);
    const isPrimaryKey = primaryKeyFields.includes(field);

    const handleClick = useCallback(() => {
        const newFields = isSelected
            ? strategies.lookupFields.filter((f) => f !== field)
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
            aria-label={isSelected
                ? t`Remove ${field} as a lookup field ${isPrimaryKey ? t`(primary key)` : ''}`
                : t`Add ${field} as a lookup field ${isPrimaryKey ? t`(primary key)` : ''}`}
            data-testid={`datahub-wizard-lookup-field-${field}-btn`}
        >
            {field}
            {isPrimaryKey && (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                    <Trans>PK</Trans>
                </Badge>
            )}
        </Button>
    );
});

interface ExistingRecordsCardProps {
    strategies: ImportConfiguration['strategies'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    options: WizardStrategyMapping[];
}

function ExistingRecordsCard({
    strategies,
    updateConfig,
    options,
}: ExistingRecordsCardProps) {
    const { t } = useLingui();

    return (
        <Card>
            <CardHeader>
                <CardTitle><Trans>Existing records</Trans></CardTitle>
                <CardDescription>
                    <Trans>What to do when a record already exists</Trans>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div
                    className="grid grid-cols-2 md:grid-cols-4 gap-3"
                    role="group"
                    aria-label={t`Existing record strategy options`}
                >
                    {options.map((option) => (
                        <StrategyOptionButton
                            key={option.wizardValue}
                            option={option}
                            isSelected={
                                strategies.existingRecords === option.wizardValue
                            }
                            strategies={strategies}
                            updateConfig={updateConfig}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

interface StrategyOptionButtonProps {
    option: WizardStrategyMapping;
    isSelected: boolean;
    strategies: ImportConfiguration['strategies'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

const StrategyOptionButton = memo(function StrategyOptionButton({
    option,
    isSelected,
    strategies,
    updateConfig,
}: StrategyOptionButtonProps) {
    const { t } = useLingui();
    const handleClick = useCallback(() => {
        updateConfig({
            strategies: {
                ...strategies,
                existingRecords: option.wizardValue,
            },
        });
    }, [option.wizardValue, strategies, updateConfig]);

    return (
        <Button
            variant={isSelected ? 'default' : 'outline'}
            className="h-auto p-3 justify-start"
            onClick={handleClick}
            aria-pressed={isSelected}
            aria-label={t`${option.label} strategy for existing records`}
            data-testid={`datahub-wizard-strategy-existing-${option.wizardValue}-btn`}
        >
            <span className="font-medium">{option.label}</span>
        </Button>
    );
});

interface AdvancedOptionsCardProps {
    strategies: ImportConfiguration['strategies'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

function AdvancedOptionsCard({
    strategies,
    updateConfig,
}: AdvancedOptionsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle><Trans>Advanced options</Trans></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="strategy-batch-size"><Trans>Batch size</Trans></Label>
                    <Input
                        id="strategy-batch-size"
                        type="number"
                        value={strategies.batchSize}
                        onChange={(e) =>
                            updateConfig({
                                strategies: {
                                    ...strategies,
                                    batchSize:
                                        parseInt(e.target.value) ||
                                        UI_DEFAULTS.IMPORT_BATCH_SIZE,
                                },
                            })
                        }
                    />
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Switch
                            id="continue-on-error"
                            checked={strategies.continueOnError}
                            onCheckedChange={(continueOnError) =>
                                updateConfig({
                                    strategies: {
                                        ...strategies,
                                        continueOnError,
                                    },
                                })
                            }
                        />
                        <Label htmlFor="continue-on-error">
                            <Trans>Continue on error</Trans>
                        </Label>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

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
import {
    EXISTING_RECORDS_STRATEGIES,
    NEW_RECORDS_STRATEGIES,
    CLEANUP_STRATEGIES,
    UI_DEFAULTS,
} from '../../../constants';
import type { ExistingRecordsStrategy, NewRecordsStrategy, CleanupStrategy } from '../../../constants';
import { STEP_CONTENT } from './constants';

type CleanupStrategy = ImportStrategies['cleanupStrategy'];

interface StrategyStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function StrategyStep({ config, updateConfig, errors = {} }: StrategyStepProps) {
    const strategies = config.strategies!;
    const primaryKeyFields = config.targetSchema?.primaryKey
        ? (Array.isArray(config.targetSchema.primaryKey)
            ? config.targetSchema.primaryKey
            : [config.targetSchema.primaryKey])
        : [];

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
            <ExistingRecordsCard strategies={strategies} updateConfig={updateConfig} />
            <NewRecordsCard strategies={strategies} updateConfig={updateConfig} />
            <AdvancedOptionsCard strategies={strategies} updateConfig={updateConfig} />
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
                    <div className="flex flex-wrap gap-2">
                        {config.targetSchema && Object.keys(config.targetSchema.fields).map(field => {
                            const isSelected = strategies.lookupFields.includes(field);
                            const isPrimaryKey = primaryKeyFields.includes(field);

                            return (
                                <Button
                                    key={field}
                                    variant={isSelected ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => {
                                        const newFields = isSelected
                                            ? strategies.lookupFields.filter(f => f !== field)
                                            : [...strategies.lookupFields, field];
                                        updateConfig({
                                            strategies: { ...strategies, lookupFields: newFields },
                                        });
                                    }}
                                >
                                    {field}
                                    {isPrimaryKey && <Badge variant="secondary" className="ml-1 text-[10px]">PK</Badge>}
                                </Button>
                            );
                        })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Selected: {strategies.lookupFields.join(', ') || 'None'}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

interface ExistingRecordsCardProps {
    strategies: ImportConfiguration['strategies'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

function ExistingRecordsCard({ strategies, updateConfig }: ExistingRecordsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Existing Records</CardTitle>
                <CardDescription>What to do when a record already exists</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {EXISTING_RECORDS_STRATEGIES.map(option => (
                        <button
                            key={option.value}
                            className={`p-3 border rounded-lg text-left transition-all ${
                                strategies.existingRecords === option.value
                                    ? 'border-primary bg-primary/5'
                                    : 'hover:border-primary/50'
                            }`}
                            onClick={() => updateConfig({
                                strategies: { ...strategies, existingRecords: option.value as ExistingRecordsStrategy },
                            })}
                        >
                            <div className="font-medium">{option.label}</div>
                        </button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

interface NewRecordsCardProps {
    strategies: ImportConfiguration['strategies'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

function NewRecordsCard({ strategies, updateConfig }: NewRecordsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>New Records</CardTitle>
                <CardDescription>What to do with records that don't exist yet</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-3 gap-3">
                    {NEW_RECORDS_STRATEGIES.map(option => (
                        <button
                            key={option.value}
                            className={`p-3 border rounded-lg text-left transition-all ${
                                strategies.newRecords === option.value
                                    ? 'border-primary bg-primary/5'
                                    : 'hover:border-primary/50'
                            }`}
                            onClick={() => updateConfig({
                                strategies: { ...strategies, newRecords: option.value as NewRecordsStrategy },
                            })}
                        >
                            <div className="font-medium">{option.label}</div>
                        </button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

interface AdvancedOptionsCardProps {
    strategies: ImportConfiguration['strategies'];
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

function AdvancedOptionsCard({ strategies, updateConfig }: AdvancedOptionsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Advanced Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Batch Size</Label>
                        <Input
                            type="number"
                            value={strategies.batchSize}
                            onChange={e => updateConfig({
                                strategies: { ...strategies, batchSize: parseInt(e.target.value) || UI_DEFAULTS.IMPORT_BATCH_SIZE },
                            })}
                        />
                    </div>
                    <div>
                        <Label>Error Threshold (%)</Label>
                        <Input
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
                            checked={strategies.publishAfterImport}
                            onCheckedChange={publishAfterImport => updateConfig({
                                strategies: { ...strategies, publishAfterImport },
                            })}
                        />
                        <Label>Publish after import</Label>
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch
                            checked={strategies.continueOnError}
                            onCheckedChange={continueOnError => updateConfig({
                                strategies: { ...strategies, continueOnError },
                            })}
                        />
                        <Label>Continue on error</Label>
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
                            {CLEANUP_STRATEGIES.map(option => (
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

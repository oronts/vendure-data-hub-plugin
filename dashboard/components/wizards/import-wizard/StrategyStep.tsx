/**
 * Import Wizard - Strategy Step Component
 * Handles import strategy configuration
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
    Switch,
    Badge,
} from '@vendure/dashboard';
import type { ImportConfiguration, ImportStrategies } from './types';

/** Strategy types extracted from ImportStrategies */
type ExistingRecordsStrategy = ImportStrategies['existingRecords'];
type NewRecordsStrategy = ImportStrategies['newRecords'];
type CleanupStrategy = ImportStrategies['cleanupStrategy'];

interface StrategyStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

export function StrategyStep({ config, updateConfig }: StrategyStepProps) {
    const strategies = config.strategies!;
    const primaryKeyFields = config.targetSchema?.primaryKey
        ? (Array.isArray(config.targetSchema.primaryKey)
            ? config.targetSchema.primaryKey
            : [config.targetSchema.primaryKey])
        : [];

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Import Strategy</h2>
                <p className="text-muted-foreground">
                    Configure how to handle existing and new records
                </p>
            </div>

            {/* Lookup Fields */}
            <LookupFieldsCard
                config={config}
                updateConfig={updateConfig}
                strategies={strategies}
                primaryKeyFields={primaryKeyFields}
            />

            {/* Existing Records Strategy */}
            <ExistingRecordsCard strategies={strategies} updateConfig={updateConfig} />

            {/* New Records Strategy */}
            <NewRecordsCard strategies={strategies} updateConfig={updateConfig} />

            {/* Advanced Options */}
            <AdvancedOptionsCard strategies={strategies} updateConfig={updateConfig} />
        </div>
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
    const options = [
        { id: 'update', label: 'Update', desc: 'Update existing fields' },
        { id: 'replace', label: 'Replace', desc: 'Replace entire record' },
        { id: 'skip', label: 'Skip', desc: 'Skip and continue' },
        { id: 'error', label: 'Error', desc: 'Stop import with error' },
    ];

    return (
        <Card>
            <CardHeader>
                <CardTitle>Existing Records</CardTitle>
                <CardDescription>What to do when a record already exists</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {options.map(option => (
                        <button
                            key={option.id}
                            className={`p-3 border rounded-lg text-left transition-all ${
                                strategies.existingRecords === option.id
                                    ? 'border-primary bg-primary/5'
                                    : 'hover:border-primary/50'
                            }`}
                            onClick={() => updateConfig({
                                strategies: { ...strategies, existingRecords: option.id as ExistingRecordsStrategy },
                            })}
                        >
                            <div className="font-medium">{option.label}</div>
                            <div className="text-xs text-muted-foreground">{option.desc}</div>
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
    const options = [
        { id: 'create', label: 'Create', desc: 'Create new records' },
        { id: 'skip', label: 'Skip', desc: 'Skip new records' },
        { id: 'error', label: 'Error', desc: 'Stop import' },
    ];

    return (
        <Card>
            <CardHeader>
                <CardTitle>New Records</CardTitle>
                <CardDescription>What to do with records that don't exist yet</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-3 gap-3">
                    {options.map(option => (
                        <button
                            key={option.id}
                            className={`p-3 border rounded-lg text-left transition-all ${
                                strategies.newRecords === option.id
                                    ? 'border-primary bg-primary/5'
                                    : 'hover:border-primary/50'
                            }`}
                            onClick={() => updateConfig({
                                strategies: { ...strategies, newRecords: option.id as NewRecordsStrategy },
                            })}
                        >
                            <div className="font-medium">{option.label}</div>
                            <div className="text-xs text-muted-foreground">{option.desc}</div>
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
                                strategies: { ...strategies, batchSize: parseInt(e.target.value) || 100 },
                            })}
                        />
                    </div>
                    <div>
                        <Label>Error Threshold (%)</Label>
                        <Input
                            type="number"
                            value={strategies.errorThreshold}
                            onChange={e => updateConfig({
                                strategies: { ...strategies, errorThreshold: parseInt(e.target.value) || 10 },
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
                            <SelectItem value="none">No cleanup</SelectItem>
                            <SelectItem value="unpublish-missing">Unpublish missing records</SelectItem>
                            <SelectItem value="delete-missing">Delete missing records</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
}

export default StrategyStep;

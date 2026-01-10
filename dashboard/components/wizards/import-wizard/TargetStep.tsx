/**
 * Import Wizard - Target Step Component
 * Handles target entity selection
 */

import * as React from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
} from '@vendure/dashboard';
import { Check } from 'lucide-react';
import { VENDURE_ENTITY_LIST, VENDURE_ENTITY_SCHEMAS } from '../../../../vendure-schemas/vendure-entity-schemas';
import type { EnhancedFieldDefinition } from '../../../../types/index';
import type { ImportConfiguration } from './types';

interface TargetStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

export function TargetStep({ config, updateConfig }: TargetStepProps) {
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Select Target Entity</h2>
                <p className="text-muted-foreground">
                    Choose which Vendure entity to import data into
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {VENDURE_ENTITY_LIST.map(entity => {
                    const isSelected = config.targetEntity === entity.code;
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
                            onClick={() => updateConfig({ targetEntity: entity.code })}
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

            {config.targetEntity && config.targetSchema && (
                <Card>
                    <CardHeader>
                        <CardTitle>Schema Fields</CardTitle>
                        <CardDescription>
                            Available fields for {VENDURE_ENTITY_LIST.find(e => e.code === config.targetEntity)?.name}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {Object.entries(config.targetSchema.fields).map(([name, field]) => (
                                <div
                                    key={name}
                                    className="flex items-center gap-2 p-2 rounded bg-muted/50"
                                >
                                    <span className="font-mono text-sm">{name}</span>
                                    {(field as EnhancedFieldDefinition).required && (
                                        <Badge variant="destructive" className="text-[10px] px-1">req</Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

export default TargetStep;

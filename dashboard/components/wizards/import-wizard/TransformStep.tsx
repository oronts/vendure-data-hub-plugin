/**
 * Import Wizard - Transform Step Component
 * Handles transformation pipeline configuration
 */

import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@vendure/dashboard';
import {
    Trash2,
    Settings,
    GripVertical,
    Zap,
} from 'lucide-react';
import type { ImportConfiguration, TransformationType } from './types';

interface TransformStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

const TRANSFORM_TYPES = [
    { id: 'map', label: 'Map/Rename', description: 'Rename fields or transform values' },
    { id: 'filter', label: 'Filter', description: 'Filter out rows based on conditions' },
    { id: 'lookup', label: 'Lookup', description: 'Enrich data from other sources' },
    { id: 'formula', label: 'Formula', description: 'Calculate new field values' },
    { id: 'validate', label: 'Validate', description: 'Validate data against rules' },
    { id: 'split', label: 'Split', description: 'Split field into multiple values' },
    { id: 'merge', label: 'Merge', description: 'Combine multiple fields' },
];

export function TransformStep({ config, updateConfig }: TransformStepProps) {
    const addTransform = (type: TransformationType) => {
        updateConfig({
            transformations: [
                ...(config.transformations ?? []),
                { id: `${type}-${Date.now()}`, type, config: {} },
            ],
        });
    };

    const removeTransform = (id: string) => {
        updateConfig({
            transformations: (config.transformations ?? []).filter(t => t.id !== id),
        });
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Data Transformations</h2>
                <p className="text-muted-foreground">
                    Add transformations to process data before import (optional)
                </p>
            </div>

            {/* Available Transformations */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {TRANSFORM_TYPES.map(type => (
                    <Button
                        key={type.id}
                        variant="outline"
                        className="h-auto py-3 flex-col items-start"
                        onClick={() => addTransform(type.id as TransformationType)}
                    >
                        <span className="font-medium">{type.label}</span>
                        <span className="text-xs text-muted-foreground">{type.description}</span>
                    </Button>
                ))}
            </div>

            {/* Added Transformations */}
            {(config.transformations?.length ?? 0) > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Transformation Pipeline</CardTitle>
                        <CardDescription>
                            Transformations are applied in order from top to bottom
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {config.transformations?.map((transform, index) => (
                            <div
                                key={transform.id}
                                className="flex items-center gap-3 p-3 border rounded-lg"
                            >
                                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                                    {index + 1}
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium capitalize">{transform.type}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {TRANSFORM_TYPES.find(t => t.id === transform.type)?.description}
                                    </div>
                                </div>
                                <Button variant="outline" size="sm">
                                    <Settings className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeTransform(transform.id)}
                                >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {(config.transformations?.length ?? 0) === 0 && (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                    <Zap className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="font-medium">No transformations added</p>
                    <p className="text-sm text-muted-foreground">
                        Click a transformation type above to add it to the pipeline
                    </p>
                </div>
            )}
        </div>
    );
}

export default TransformStep;

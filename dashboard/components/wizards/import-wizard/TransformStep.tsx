import { useCallback } from 'react';
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
import { WizardStepContainer } from '../shared';
import { EmptyState } from '../../shared/feedback';
import { TRANSFORM_TYPES, STEP_CONTENT } from './constants';
import type { ImportConfiguration, TransformationType } from './types';

interface TransformStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function TransformStep({ config, updateConfig, errors = {} }: TransformStepProps) {
    const addTransform = useCallback((type: TransformationType) => {
        updateConfig({
            transformations: [
                ...(config.transformations ?? []),
                { id: `${type}-${Date.now()}`, type, config: {} },
            ],
        });
    }, [config.transformations, updateConfig]);

    const removeTransform = useCallback((id: string) => {
        updateConfig({
            transformations: (config.transformations ?? []).filter(t => t.id !== id),
        });
    }, [config.transformations, updateConfig]);

    return (
        <WizardStepContainer
            title={STEP_CONTENT.transform.title}
            description={STEP_CONTENT.transform.description}
        >
            <TransformTypeButtons onAdd={addTransform} />

            {(config.transformations?.length ?? 0) > 0 && (
                <TransformPipelineCard
                    transformations={config.transformations!}
                    onRemove={removeTransform}
                />
            )}

            {(config.transformations?.length ?? 0) === 0 && (
                <EmptyState
                    icon={<Zap className="h-12 w-12" />}
                    title={STEP_CONTENT.transform.emptyTitle}
                    description={STEP_CONTENT.transform.emptyDescription}
                />
            )}
        </WizardStepContainer>
    );
}

interface TransformTypeButtonsProps {
    onAdd: (type: TransformationType) => void;
}

function TransformTypeButtons({ onAdd }: TransformTypeButtonsProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {TRANSFORM_TYPES.map(type => (
                <Button
                    key={type.id}
                    variant="outline"
                    className="h-auto py-3 flex-col items-start"
                    onClick={() => onAdd(type.id as TransformationType)}
                >
                    <span className="font-medium">{type.label}</span>
                    <span className="text-xs text-muted-foreground">{type.description}</span>
                </Button>
            ))}
        </div>
    );
}

interface TransformPipelineCardProps {
    transformations: ImportConfiguration['transformations'];
    onRemove: (id: string) => void;
}

function TransformPipelineCard({ transformations, onRemove }: TransformPipelineCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Transformation Pipeline</CardTitle>
                <CardDescription>
                    Transformations are applied in order from top to bottom
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {transformations.map((transform, index) => (
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
                            onClick={() => onRemove(transform.id)}
                            aria-label={`Remove ${transform.type} transform`}
                        >
                            <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

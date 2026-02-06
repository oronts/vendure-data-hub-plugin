import { useCallback, memo } from 'react';
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="datahub-transform-type-buttons">
            {TRANSFORM_TYPES.map(type => (
                <TransformTypeButton
                    key={type.id}
                    type={type}
                    onAdd={onAdd}
                />
            ))}
        </div>
    );
}

interface TransformTypeButtonProps {
    type: typeof TRANSFORM_TYPES[number];
    onAdd: (type: TransformationType) => void;
}

const TransformTypeButton = memo(function TransformTypeButton({ type, onAdd }: TransformTypeButtonProps) {
    const handleClick = useCallback(() => {
        onAdd(type.id as TransformationType);
    }, [type.id, onAdd]);

    return (
        <Button
            variant="outline"
            className="h-auto py-3 flex-col items-start"
            onClick={handleClick}
            data-testid={`datahub-transform-add-${type.id}-button`}
        >
            <span className="font-medium">{type.label}</span>
            <span className="text-xs text-muted-foreground">{type.description}</span>
        </Button>
    );
});

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
                    <TransformPipelineRow
                        key={transform.id}
                        transform={transform}
                        index={index}
                        onRemove={onRemove}
                    />
                ))}
            </CardContent>
        </Card>
    );
}

interface TransformPipelineRowProps {
    transform: ImportConfiguration['transformations'][number];
    index: number;
    onRemove: (id: string) => void;
}

const TransformPipelineRow = memo(function TransformPipelineRow({ transform, index, onRemove }: TransformPipelineRowProps) {
    const handleRemove = useCallback(() => {
        onRemove(transform.id);
    }, [transform.id, onRemove]);

    return (
        <div className="flex items-center gap-3 p-3 border rounded-lg">
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
            <Button variant="outline" size="sm" data-testid={`datahub-transform-settings-${transform.id}-button`} aria-label="Configure transform">
                <Settings className="w-4 h-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={handleRemove}
                aria-label={`Remove ${transform.type} transform`}
                data-testid={`datahub-transform-remove-${transform.id}-button`}
            >
                <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
        </div>
    );
});

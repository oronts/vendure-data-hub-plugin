import { useCallback, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Zap } from 'lucide-react';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import type { WizardTransformationStep } from '../../../types/wizard';
import { EmptyState } from '../../shared/feedback';
import { WizardStepContainer } from '../shared';
import { TransformConfigDialog } from './TransformConfigDialog';
import { TransformPipelineCard } from './TransformPipelineCard';
import { TransformTypeButtons } from './TransformTypeButtons';
import { useTransformTypesFromData } from './transform-operator-metadata';
import type { ImportConfiguration, TransformationType } from './types';

interface TransformStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
}

export function TransformStep({ config, updateConfig }: TransformStepProps) {
    const { t } = useLingui();
    const [editingTransform, setEditingTransform] = useState<WizardTransformationStep | null>(null);
    const { data: operators } = useAdaptersByType('OPERATOR');
    const transformTypes = useTransformTypesFromData(operators);

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
            transformations: (config.transformations ?? []).filter(transform => transform.id !== id),
        });
    }, [config.transformations, updateConfig]);

    const openSettings = useCallback((transform: WizardTransformationStep) => {
        setEditingTransform({ ...transform, config: { ...transform.config } });
    }, []);

    const saveSettings = useCallback((updatedConfig: Record<string, unknown>) => {
        if (!editingTransform) return;
        updateConfig({
            transformations: (config.transformations ?? []).map(transform => (
                transform.id === editingTransform.id
                    ? { ...transform, config: updatedConfig }
                    : transform
            )),
        });
        setEditingTransform(null);
    }, [editingTransform, config.transformations, updateConfig]);

    const transformations = config.transformations ?? [];
    return (
        <WizardStepContainer
            title={t`Add transformations`}
            description={t`Configure optional transformations applied before loading records.`}
        >
            <TransformTypeButtons onAdd={addTransform} operators={operators} />
            {transformations.length > 0
                ? (
                    <TransformPipelineCard
                        transformations={transformations}
                        transformTypes={transformTypes}
                        onRemove={removeTransform}
                        onSettings={openSettings}
                    />
                )
                : (
                    <EmptyState
                        icon={<Zap className="h-8 w-8" />}
                        title={t`No transformations configured`}
                        description={t`Add an operator above to build the transformation pipeline.`}
                    />
                )}
            {editingTransform && (
                <TransformConfigDialog
                    transform={editingTransform}
                    transformTypes={transformTypes}
                    operators={operators}
                    onSave={saveSettings}
                    onClose={() => setEditingTransform(null)}
                />
            )}
        </WizardStepContainer>
    );
}

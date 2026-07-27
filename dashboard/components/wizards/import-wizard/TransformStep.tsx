import { useCallback, useState } from 'react';
import { useLingui } from '@lingui/react';
import { Zap } from 'lucide-react';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import type { WizardTransformationStep } from '../../../types/wizard';
import { EmptyState } from '../../shared/feedback';
import { WizardStepContainer } from '../shared';
import { STEP_CONTENT } from './constants';
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
    const { i18n } = useLingui();
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
            title={i18n._(STEP_CONTENT.transform.title)}
            description={i18n._(STEP_CONTENT.transform.description)}
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
                        title={i18n._(STEP_CONTENT.transform.emptyTitle)}
                        description={i18n._(STEP_CONTENT.transform.emptyDescription)}
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

import * as React from 'react';
import { useCallback, useEffect, useMemo } from 'react';

import { useAdapterCatalog, useStepConfigs } from '../../../hooks';
import { getAdapterTypeForStep, normalizeStepType } from '../../../utils';
import { STEP_TYPE } from '../../../constants';
import type { AdapterSchemaField, PipelineTrigger, TriggerType } from '../../../types';
import { StepConfigBasics } from './StepConfigBasics';
import { StepConfigDetails } from './StepConfigDetails';
import { hasSpecialConfigEditor } from './special-config-editors';
import type {
    StepConfigData,
    StepConfigPanelProps,
} from './step-config-panel.types';

export type { StepConfigData, StepConfigPanelProps } from './step-config-panel.types';

export function StepConfigPanel({
    data,
    onChange,
    onDelete,
    catalog: externalCatalog,
    variant = 'inline',
    showKeyInput = true,
    showHeader = true,
    showDeleteButton = true,
    showCheatSheet = true,
    showStepTester = true,
    showAdvancedEditors = true,
    compact = false,
    errors = {},
    catalogLoading,
    catalogError,
}: StepConfigPanelProps) {
    const fieldIdPrefix = React.useId();
    const hookResult = useAdapterCatalog();
    const { getStepConfig } = useStepConfigs();
    const catalog = externalCatalog ?? hookResult.adapters;
    const isLoadingCatalog = externalCatalog ? catalogLoading === true : hookResult.isLoading;
    const adapterCatalogError = externalCatalog ? catalogError : hookResult.error;
    const stepType = normalizeStepType(data.type);
    const stepPresentation = getStepConfig(stepType);
    const adapterType = getAdapterTypeForStep(data.type);
    const adapterCode = data.adapterCode ?? (data.config.adapterCode as string | undefined);

    const availableAdapters = useMemo(
        () => (adapterType ? catalog.filter(adapter => adapter.type === adapterType) : []),
        [adapterType, catalog],
    );
    const selectedAdapter = useMemo(
        () => availableAdapters.find(adapter => adapter.code === adapterCode),
        [adapterCode, availableAdapters],
    );
    const dynamicFields = useMemo<AdapterSchemaField[]>(
        () => selectedAdapter?.schema.fields ?? [],
        [selectedAdapter?.schema.fields],
    );
    const hasMultiOperatorConfig = stepType === STEP_TYPE.TRANSFORM
        && Array.isArray(data.config.operators)
        && data.config.operators.length > 0;
    const needsAdapterSelection = !adapterCode
        && !hasMultiOperatorConfig
        && stepType !== STEP_TYPE.TRIGGER
        && !hasSpecialConfigEditor(stepType);

    const updateData = useCallback((updates: Partial<StepConfigData>) => {
        onChange({ ...data, ...updates });
    }, [data, onChange]);
    const updateConfig = useCallback((values: Record<string, unknown>) => {
        updateData({ config: { ...data.config, ...values } });
    }, [data.config, updateData]);
    const updateOperators = useCallback((
        operators: Array<{ op: string; args?: Record<string, unknown> }>,
    ) => {
        updateConfig({ operators });
    }, [updateConfig]);
    const updateAdapterCode = useCallback((code: string) => {
        if (code && code !== adapterCode) {
            updateData({ adapterCode: code });
        }
    }, [adapterCode, updateData]);
    const updateTrigger = useCallback((trigger: PipelineTrigger) => {
        updateConfig(Object.fromEntries(
            Object.entries(trigger).filter(([, value]) => value !== undefined),
        ));
    }, [updateConfig]);

    useEffect(() => {
        if (
            hasSpecialConfigEditor(stepType)
            && !adapterCode
            && availableAdapters.length === 1
        ) {
            updateAdapterCode(availableAdapters[0].code);
        }
    }, [adapterCode, availableAdapters, stepType, updateAdapterCode]);

    const triggerValue = useMemo<PipelineTrigger>(() => ({
        ...data.config,
        type: (data.config.type as TriggerType | undefined) || 'MANUAL',
        enabled: data.config.enabled !== false,
    }) as PipelineTrigger, [data.config]);

    return (
        <div className={compact ? 'space-y-3' : 'space-y-4'}>
            <StepConfigBasics
                data={data}
                stepType={stepType}
                stepPresentation={stepPresentation}
                adapterType={adapterType}
                adapterCode={adapterCode}
                availableAdapters={availableAdapters}
                selectedAdapter={selectedAdapter}
                triggerValue={triggerValue}
                variant={variant}
                compact={compact}
                showHeader={showHeader}
                showKeyInput={showKeyInput}
                showDeleteButton={showDeleteButton}
                showCheatSheet={showCheatSheet}
                needsAdapterSelection={needsAdapterSelection}
                isLoadingCatalog={isLoadingCatalog}
                catalogError={adapterCatalogError}
                stepKeyId={`${fieldIdPrefix}-step-key`}
                adapterId={`${fieldIdPrefix}-adapter`}
                onDelete={onDelete}
                onKeyChange={key => updateData({ key })}
                onAdapterCodeChange={updateAdapterCode}
                onOperatorsChange={updateOperators}
                onTriggerChange={updateTrigger}
            />
            <StepConfigDetails
                data={data}
                stepType={stepType}
                adapterType={adapterType}
                selectedAdapter={selectedAdapter}
                dynamicFields={dynamicFields}
                variant={variant}
                compact={compact}
                errors={errors}
                showStepTester={showStepTester}
                showAdvancedEditors={showAdvancedEditors}
                onChange={onChange}
                onConfigChange={updateConfig}
            />
        </div>
    );
}

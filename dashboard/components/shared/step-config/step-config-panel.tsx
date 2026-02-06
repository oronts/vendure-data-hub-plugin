import * as React from 'react';
import { useMemo, useCallback } from 'react';
import {
    Button,
    Input,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Label,
    Separator,
} from '@vendure/dashboard';
import { Trash2, Settings2 } from 'lucide-react';

import { SchemaFormRenderer } from '../schema-form';
import {
    AdapterSelector,
    AdapterRequiredWarning,
    ValidateConfigComponent,
    RouteConfigComponent,
    EnrichConfigComponent,
} from './index';
import { TriggerForm } from '../trigger-config';
import { OperatorCheatSheetButton } from './operator-cheatsheet';
import {
    AdvancedMapEditor,
    AdvancedTemplateEditor,
    AdvancedWhenEditor,
    MultiOperatorEditor,
} from './advanced-editors';
import { StepTester } from './step-tester';
import { useAdapterCatalog, AdapterMetadata } from '../../../hooks';
import { getAdapterTypeLabel, prepareDynamicFields, normalizeStepType, getAdapterTypeForStep } from '../../../utils';
import {
    STEP_CONFIGS,
    STEP_TYPES,
    ADAPTER_TYPES,
    NODE_CATEGORIES,
    TRANSFORM_ADAPTER_CODE,
    PANEL_VARIANT,
    FALLBACK_COLORS,
} from '../../../constants';
import type {
    StepType,
    PipelineStepDefinition,
    PipelineTrigger,
    TriggerType,
    AdapterSchemaField,
    DataHubAdapter,
} from '../../../types';

export interface StepConfigData {
    key: string;
    type: StepType | string;
    config: Record<string, unknown>;
    adapterCode?: string;
}

export interface StepConfigPanelProps {
    data: StepConfigData;
    onChange: (data: StepConfigData) => void;
    onDelete?: () => void;
    catalog?: AdapterMetadata[];
    connectionCodes?: string[];
    secretOptions?: Array<{ code: string; provider?: string }>;
    variant?: 'panel' | 'inline';
    showKeyInput?: boolean;
    showHeader?: boolean;
    showDeleteButton?: boolean;
    showCheatSheet?: boolean;
    showStepTester?: boolean;
    showAdvancedEditors?: boolean;
    compact?: boolean;
}

export function StepConfigPanel({
    data,
    onChange,
    onDelete,
    catalog: externalCatalog,
    connectionCodes: externalConnectionCodes,
    secretOptions: externalSecretOptions,
    variant = 'inline',
    showKeyInput = true,
    showHeader = true,
    showDeleteButton = true,
    showCheatSheet = true,
    showStepTester = true,
    showAdvancedEditors = true,
    compact = false,
}: StepConfigPanelProps) {
    const hookResult = useAdapterCatalog();
    const catalog = externalCatalog ?? hookResult.adapters;
    const connectionCodes = externalConnectionCodes ?? hookResult.connectionCodes;
    const secretOptions = externalSecretOptions ?? hookResult.secretOptions;
    const isLoadingCatalog = !externalCatalog && hookResult.isLoading;

    const stepType = normalizeStepType(data.type);
    const config = STEP_CONFIGS[stepType];
    const adapterType = getAdapterTypeForStep(data.type);

    const availableAdapters = useMemo(
        () => (adapterType ? catalog.filter((a) => a.type === adapterType) : []),
        [catalog, adapterType]
    );

    const adapterCode = data.adapterCode ?? (data.config?.adapterCode as string);

    const selectedAdapter = useMemo(
        () => availableAdapters.find((a) => a.code === adapterCode),
        [availableAdapters, adapterCode]
    );

    const hasMultiOperatorConfig = useMemo(
        () =>
            stepType === STEP_TYPES.TRANSFORM &&
            Array.isArray(data.config?.operators) &&
            data.config.operators.length > 0,
        [stepType, data.config?.operators]
    );

    const needsAdapterSelection = useMemo(
        () => !adapterCode && !hasMultiOperatorConfig && stepType !== STEP_TYPES.TRIGGER,
        [adapterCode, hasMultiOperatorConfig, stepType]
    );

    const dynamicFields = React.useMemo<AdapterSchemaField[]>(
        () =>
            prepareDynamicFields({
                baseFields: selectedAdapter?.schema?.fields ?? [],
                connectionCodes,
            }),
        [selectedAdapter, connectionCodes]
    );

    const updateKey = useCallback((key: string) => {
        onChange({ ...data, key });
    }, [onChange, data]);

    const updateConfig = useCallback((key: string, value: unknown) => {
        onChange({
            ...data,
            config: { ...data.config, [key]: value },
        });
    }, [onChange, data]);

    const updateConfigBatch = useCallback((values: Record<string, unknown>) => {
        onChange({
            ...data,
            config: { ...data.config, ...values },
        });
    }, [onChange, data]);

    const updateAdapterCode = useCallback((code: string) => {
        onChange({
            ...data,
            adapterCode: code,
            config: { ...data.config, adapterCode: code },
        });
    }, [onChange, data]);

    const updateOperators = useCallback((operators: Array<{ op: string; args?: Record<string, unknown> }>) => {
        onChange({
            ...data,
            config: { operators },
        });
    }, [onChange, data]);

    const handleKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateKey(e.target.value);
    }, [updateKey]);

    const handleAdapterCodeChange = useCallback((code: string) => {
        if (code !== adapterCode) {
            updateAdapterCode(code);
        }
    }, [adapterCode, updateAdapterCode]);

    const handleResetDefaults = useCallback(() => {
        const defaults: Record<string, unknown> = {};
        for (const f of dynamicFields) {
            if (f.defaultValue !== undefined) {
                defaults[f.key] = f.defaultValue;
            }
        }
        updateConfigBatch(defaults);
    }, [dynamicFields, updateConfigBatch]);

    const handleTriggerChange = useCallback((trigger: PipelineTrigger) => {
        updateConfigBatch({
            type: trigger.type,
            enabled: trigger.enabled,
            cron: trigger.cron,
            timezone: trigger.timezone,
            webhookCode: trigger.webhookCode,
            authentication: trigger.authentication,
            secretCode: trigger.secretCode,
            event: trigger.eventType,
            eventType: trigger.eventType,
        });
    }, [updateConfigBatch]);

    const triggerValue = useMemo(() => ({
        type: (data.config?.type as TriggerType) || 'manual',
        enabled: data.config?.enabled !== false,
        cron: data.config?.cron as string,
        timezone: data.config?.timezone as string,
        webhookCode: data.config?.webhookCode as string,
        authentication: data.config?.authentication as PipelineTrigger['authentication'],
        secretCode: data.config?.secretCode as string,
        eventType: (data.config?.event as string) || (data.config?.eventType as string),
    }), [data.config?.type, data.config?.enabled, data.config?.cron, data.config?.timezone, data.config?.webhookCode, data.config?.authentication, data.config?.secretCode, data.config?.event, data.config?.eventType]);

    const renderHeader = () => {
        if (!showHeader) return null;

        return (
            <div
                className={compact ? 'p-3 rounded-lg mb-3' : 'p-4 rounded-lg mb-4'}
                style={{ backgroundColor: config?.bgColor ?? FALLBACK_COLORS.UNKNOWN_STEP_BG }}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {selectedAdapter ? (
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                                style={{ backgroundColor: selectedAdapter.color }}
                            >
                                <selectedAdapter.icon className="h-4 w-4" />
                            </div>
                        ) : (
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                                style={{ backgroundColor: config?.color ?? FALLBACK_COLORS.UNKNOWN_STEP_COLOR }}
                            >
                                {stepType.charAt(0)}
                            </div>
                        )}
                        <div>
                            <h3
                                className={compact ? 'font-medium text-sm' : 'font-semibold'}
                                style={{ color: config?.color }}
                            >
                                {config?.label ?? stepType} Step
                            </h3>
                            {!compact && (
                                <p className="text-sm text-muted-foreground">{config?.description}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {showCheatSheet && adapterType === ADAPTER_TYPES.OPERATOR && (
                            <OperatorCheatSheetButton label={compact ? undefined : 'Help'} />
                        )}
                        {showDeleteButton && onDelete && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={onDelete}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderKeyInput = () => {
        if (!showKeyInput) return null;

        return (
            <div className={compact ? 'space-y-1' : 'space-y-2'}>
                <Label className={compact ? 'text-xs' : 'text-sm'}>
                    {variant === PANEL_VARIANT.PANEL ? 'Node Label' : 'Step Key'}
                </Label>
                <Input
                    value={data.key}
                    onChange={handleKeyChange}
                    placeholder="unique-step-key"
                    className={compact ? 'h-8 font-mono' : 'font-mono'}
                />
                {!compact && (
                    <p className="text-xs text-muted-foreground">
                        Unique identifier for this step in the pipeline
                    </p>
                )}
            </div>
        );
    };

    const renderTriggerConfig = () => {
        if (stepType !== STEP_TYPES.TRIGGER) return null;

        return (
            <TriggerForm
                trigger={triggerValue}
                onChange={handleTriggerChange}
                compact={compact}
            />
        );
    };

    const renderAdapterSelection = () => {
        if (!adapterType || stepType === STEP_TYPES.TRIGGER) return null;

        if (stepType === STEP_TYPES.TRANSFORM) {
            return (
                <MultiOperatorEditor
                    operators={
                        Array.isArray(data.config?.operators) ? data.config.operators : []
                    }
                    availableOperators={availableAdapters.map((a) => ({
                        code: a.code,
                        name: a.name,
                        description: a.description,
                        schema: a.schema,
                    }))}
                    onChange={updateOperators}
                />
            );
        }

        return (
            <div className={compact ? 'space-y-2' : 'space-y-3'}>
                <div className="flex items-center justify-between">
                    <Label className={compact ? 'text-xs' : 'text-sm'}>
                        {getAdapterTypeLabel(adapterType)}
                    </Label>
                    {showCheatSheet && adapterType === ADAPTER_TYPES.OPERATOR && !showHeader && (
                        <OperatorCheatSheetButton />
                    )}
                </div>

                {availableAdapters.length === 0 && isLoadingCatalog && (
                    <div className="p-3 bg-muted rounded-md">
                        <p className="text-sm text-muted-foreground">
                            Loading {getAdapterTypeLabel(adapterType).toLowerCase()}s...
                        </p>
                    </div>
                )}

                {availableAdapters.length === 0 && !isLoadingCatalog && (
                    <div className="p-3 bg-muted rounded-md border border-dashed">
                        <p className="text-sm text-muted-foreground">
                            No {getAdapterTypeLabel(adapterType).toLowerCase()}s available.
                            {adapterType === 'validator' && ' Configure validation mode below, or register custom validators for field-level validation.'}
                            {adapterType === 'enricher' && ' Register custom enrichers to add data enrichment capabilities.'}
                        </p>
                    </div>
                )}

                {availableAdapters.length > 0 && needsAdapterSelection && (
                    <AdapterRequiredWarning
                        adapterTypeLabel={getAdapterTypeLabel(adapterType).toLowerCase()}
                        compact={compact}
                    />
                )}

                {availableAdapters.length > 0 && (
                    <AdapterSelector
                        stepType={stepType}
                        value={adapterCode}
                        onChange={handleAdapterCodeChange}
                        placeholder={`Select ${getAdapterTypeLabel(adapterType).toLowerCase()}...`}
                        adapters={availableAdapters as unknown as DataHubAdapter[]}
                    />
                )}

                {selectedAdapter && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded border">
                        <div
                            className="w-7 h-7 rounded flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: selectedAdapter.color }}
                        >
                            <selectedAdapter.icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{selectedAdapter.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                                {selectedAdapter.description}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderSchemaForm = () => {
        if (!selectedAdapter?.schema?.fields?.length) return null;

        const content = (
            <SchemaFormRenderer
                schema={{ fields: dynamicFields }}
                values={data.config}
                onChange={updateConfigBatch}
                secretCodes={secretOptions.map((s) => s.code)}
                compact={compact}
            />
        );

        if (variant === PANEL_VARIANT.PANEL) {
            return (
                <>
                    <Separator />
                    <div className={compact ? 'space-y-2' : 'space-y-3'}>
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                                Configuration
                            </h4>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={handleResetDefaults}
                            >
                                Reset defaults
                            </Button>
                        </div>
                        {content}
                    </div>
                </>
            );
        }

        return (
            <Card>
                <CardHeader className="py-3">
                    <CardTitle className="text-sm">Configuration</CardTitle>
                </CardHeader>
                <CardContent>{content}</CardContent>
            </Card>
        );
    };

    const renderAdvancedEditors = () => {
        if (!showAdvancedEditors || adapterType !== ADAPTER_TYPES.OPERATOR) return null;

        const adapterCodeValue = selectedAdapter?.code;

        if (adapterCodeValue === TRANSFORM_ADAPTER_CODE.MAP) {
            return <AdvancedMapEditor config={data.config} onChange={updateConfigBatch} />;
        }
        if (adapterCodeValue === TRANSFORM_ADAPTER_CODE.TEMPLATE) {
            return <AdvancedTemplateEditor config={data.config} onChange={updateConfigBatch} />;
        }
        if (adapterCodeValue === TRANSFORM_ADAPTER_CODE.FILTER) {
            return <AdvancedWhenEditor config={data.config} onChange={updateConfigBatch} />;
        }

        return null;
    };

    const renderSpecialConfigs = () => {
        if (stepType === STEP_TYPES.ROUTE) {
            return <RouteConfigComponent config={data.config} onChange={updateConfigBatch} />;
        }

        if (stepType === STEP_TYPES.VALIDATE) {
            return (
                <ValidateConfigComponent
                    config={data.config}
                    onChange={updateConfigBatch}
                    showErrorHandling={variant === PANEL_VARIANT.PANEL}
                    showValidationMode={true}
                    showRulesEditor={true}
                />
            );
        }

        if (stepType === STEP_TYPES.ENRICH) {
            return (
                <EnrichConfigComponent
                    config={data.config}
                    onChange={updateConfigBatch}
                />
            );
        }

        return null;
    };

    const renderStepTester = () => {
        if (
            !showStepTester ||
            stepType === STEP_TYPES.TRIGGER ||
            !adapterType ||
            !selectedAdapter
        ) {
            return null;
        }

        return (
            <>
                {variant === PANEL_VARIANT.PANEL && <Separator />}
                <StepTester
                    stepType={stepType}
                    adapterType={adapterType}
                    config={{ adapterCode: data.adapterCode, ...(data.config || {}) }}
                />
            </>
        );
    };

    const spacing = compact ? 'space-y-3' : 'space-y-4';

    return (
        <div className={spacing}>
            {renderHeader()}
            {renderKeyInput()}
            {renderTriggerConfig()}
            {renderAdapterSelection()}
            {renderSchemaForm()}
            {renderSpecialConfigs()}
            {renderAdvancedEditors()}
            {renderStepTester()}
        </div>
    );
}

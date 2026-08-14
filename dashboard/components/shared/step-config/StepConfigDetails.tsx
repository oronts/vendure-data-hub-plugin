import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import {
    Button,
    Card,
    buttonVariants,
    CardContent,
    CardHeader,
    CardTitle,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    Label,
    Separator,
} from '@vendure/dashboard';
import { ChevronDown } from 'lucide-react';

import { setNestedValue } from '../../../../shared/utils/object-path';
import type { AdapterMetadata } from '../../../hooks';
import type { AdapterSchemaField, StepContextOverride, StepType } from '../../../types';
import { ADAPTER_TYPES, PANEL_VARIANT, STEP_TYPE } from '../../../constants';
import { ExecutionContextFields } from '../ExecutionContextFields';
import { SchemaFormRenderer } from '../schema-form';
import { SchemaReferenceSelector } from '../SchemaReferenceSelector';
import {
    AdvancedMapEditor,
    AdvancedTemplateEditor,
    AdvancedWhenEditor,
} from './AdvancedEditors';
import { RetrySettingsComponent } from './RetrySettingsComponent';
import type { RetrySettings } from './RetrySettingsComponent';
import { getSpecialConfigEditor } from './special-config-editors';
import { StepTester } from './StepTester';
import type { StepConfigData } from './step-config-panel.types';

const ADVANCED_EDITORS: Record<
    string,
    React.ComponentType<{
        readonly config: Record<string, unknown>;
        readonly onChange: (values: Record<string, unknown>) => void;
    }>
> = {
    map: AdvancedMapEditor,
    template: AdvancedTemplateEditor,
    filter: AdvancedWhenEditor,
};

interface StepConfigDetailsProps {
    readonly data: StepConfigData;
    readonly stepType: StepType;
    readonly adapterType: string | null;
    readonly selectedAdapter: AdapterMetadata | undefined;
    readonly dynamicFields: AdapterSchemaField[];
    readonly variant: 'panel' | 'inline';
    readonly compact: boolean;
    readonly errors: Record<string, string>;
    readonly showStepTester: boolean;
    readonly showAdvancedEditors: boolean;
    readonly onChange: (data: StepConfigData) => void;
    readonly onConfigChange: (values: Record<string, unknown>) => void;
}

export function StepConfigDetails(props: StepConfigDetailsProps) {
    const {
        data,
        stepType,
        adapterType,
        selectedAdapter,
        dynamicFields,
        variant,
        compact,
        errors,
        showStepTester,
        showAdvancedEditors,
        onChange,
        onConfigChange,
    } = props;
    const [contextOpen, setContextOpen] = useState(
        () => Object.keys(data.context ?? {}).length > 0,
    );
    const previousStepKey = React.useRef(data.key);

    useEffect(() => {
        if (previousStepKey.current === data.key) return;
        previousStepKey.current = data.key;
        setContextOpen(Object.keys(data.context ?? {}).length > 0);
    }, [data.context, data.key]);

    const updateContext = useCallback((context: StepContextOverride) => {
        const next = { ...data };
        if (Object.keys(context).length === 0) {
            delete next.context;
        } else {
            next.context = context;
        }
        onChange(next);
    }, [data, onChange]);

    return (
        <>
            <SchemaReference
                data={data}
                stepType={stepType}
                compact={compact}
                onChange={onChange}
            />
            <SchemaConfiguration
                data={data}
                selectedAdapter={selectedAdapter}
                dynamicFields={dynamicFields}
                variant={variant}
                compact={compact}
                errors={errors}
                onConfigChange={onConfigChange}
            />
            <SpecialConfiguration
                data={data}
                stepType={stepType}
                variant={variant}
                onConfigChange={onConfigChange}
            />
            <AdvancedConfiguration
                data={data}
                adapterType={adapterType}
                selectedAdapter={selectedAdapter}
                enabled={showAdvancedEditors}
                onConfigChange={onConfigChange}
            />
            <RetryConfiguration
                data={data}
                stepType={stepType}
                onConfigChange={onConfigChange}
            />
            {stepType !== STEP_TYPE.TRIGGER && (
                <ContextOverrides
                    data={data}
                    stepType={stepType}
                    variant={variant}
                    compact={compact}
                    errors={errors}
                    open={contextOpen}
                    onOpenChange={setContextOpen}
                    onChange={updateContext}
                />
            )}
            {showStepTester && adapterType && selectedAdapter && stepType !== STEP_TYPE.TRIGGER && (
                <>
                    {variant === PANEL_VARIANT.PANEL && <Separator />}
                    <StepTester
                        stepType={stepType}
                        adapterType={adapterType}
                        config={{ adapterCode: data.adapterCode, ...data.config }}
                        schemaRef={data.schemaRef}
                    />
                </>
            )}
        </>
    );
}

function SchemaReference({
    data,
    stepType,
    compact,
    onChange,
}: Pick<StepConfigDetailsProps, 'data' | 'stepType' | 'compact' | 'onChange'>) {
    if (stepType !== STEP_TYPE.EXTRACT && stepType !== STEP_TYPE.VALIDATE) return null;
    return (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
            <Label className={compact ? 'text-xs' : 'text-sm'}>
                <Trans>Registry schema</Trans>
            </Label>
            <SchemaReferenceSelector
                value={data.schemaRef}
                onChange={schemaRef => onChange({ ...data, schemaRef })}
            />
            {!compact && (
                <p className="text-xs text-muted-foreground">
                    <Trans>Bind this step to an immutable schema version.</Trans>
                </p>
            )}
        </div>
    );
}

function SchemaConfiguration({
    data,
    selectedAdapter,
    dynamicFields,
    variant,
    compact,
    errors,
    onConfigChange,
}: Pick<
    StepConfigDetailsProps,
    | 'data'
    | 'selectedAdapter'
    | 'dynamicFields'
    | 'variant'
    | 'compact'
    | 'errors'
    | 'onConfigChange'
>) {
    if (!selectedAdapter?.schema.fields.length) return null;
    const resetDefaults = () => {
        let defaults: Record<string, unknown> = {};
        for (const field of dynamicFields) {
            if (field.default !== undefined) {
                defaults = setNestedValue(defaults, field.key, field.default);
            }
        }
        onConfigChange(defaults);
    };
    const content = (
        <SchemaFormRenderer
            schema={{ ...selectedAdapter.schema, fields: dynamicFields }}
            values={data.config}
            onChange={onConfigChange}
            errors={errors}
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
                            <Trans>Configuration</Trans>
                        </h4>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={resetDefaults}>
                            <Trans>Reset defaults</Trans>
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
                <CardTitle className="text-sm"><Trans>Configuration</Trans></CardTitle>
            </CardHeader>
            <CardContent>{content}</CardContent>
        </Card>
    );
}

function SpecialConfiguration({
    data,
    stepType,
    variant,
    onConfigChange,
}: Pick<StepConfigDetailsProps, 'data' | 'stepType' | 'variant' | 'onConfigChange'>) {
    const SpecialEditor = getSpecialConfigEditor(stepType);
    if (!SpecialEditor) return null;
    return (
        <SpecialEditor
            config={data.config}
            onChange={onConfigChange}
            showErrorHandling={variant === PANEL_VARIANT.PANEL}
            showRulesEditor
        />
    );
}

function AdvancedConfiguration({
    data,
    adapterType,
    selectedAdapter,
    enabled,
    onConfigChange,
}: Pick<
    StepConfigDetailsProps,
    'data' | 'adapterType' | 'selectedAdapter' | 'onConfigChange'
> & { readonly enabled: boolean }) {
    if (!enabled || adapterType !== ADAPTER_TYPES.OPERATOR) return null;
    const editorType = selectedAdapter?.editorType ?? selectedAdapter?.code;
    if (!editorType) return null;
    const Editor = ADVANCED_EDITORS[editorType];
    return Editor ? <Editor config={data.config} onChange={onConfigChange} /> : null;
}

function RetryConfiguration({
    data,
    stepType,
    onConfigChange,
}: Pick<StepConfigDetailsProps, 'data' | 'stepType' | 'onConfigChange'>) {
    if (stepType !== STEP_TYPE.TRANSFORM) return null;
    const retrySettings: RetrySettings = {
        maxRetries: data.config.retryMaxRetries as number | undefined,
        retryDelayMs: data.config.retryDelayMs as number | undefined,
        backoff: data.config.retryBackoff as RetrySettings['backoff'],
    };
    const handleChange = (next: RetrySettings | undefined) => onConfigChange({
        retryMaxRetries: next?.maxRetries,
        retryDelayMs: next?.retryDelayMs,
        retryBackoff: next?.backoff,
    });
    return <RetrySettingsComponent retrySettings={retrySettings} onChange={handleChange} />;
}

interface ContextOverridesProps {
    readonly data: StepConfigData;
    readonly stepType: StepType;
    readonly variant: 'panel' | 'inline';
    readonly compact: boolean;
    readonly errors: Record<string, string>;
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly onChange: (context: StepContextOverride) => void;
}

function ContextOverrides({
    data,
    stepType,
    variant,
    compact,
    errors,
    open,
    onOpenChange,
    onChange,
}: ContextOverridesProps) {
    const configuredCount = Object.keys(data.context ?? {}).length;
    return (
        <>
            {variant === PANEL_VARIANT.PANEL && <Separator />}
            <Collapsible open={open} onOpenChange={onOpenChange}>
                <Card>
                    <CardHeader className="py-2">
                        <CollapsibleTrigger
                            className={buttonVariants({ variant: 'ghost', className: 'h-auto w-full justify-between px-1 py-1' })}
                        >
                            <CardTitle className="text-sm">
                                <Trans>Execution context overrides</Trans>
                                {configuredCount > 0 ? ` (${configuredCount})` : ''}
                            </CardTitle>
                            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </CollapsibleTrigger>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent>
                            <ExecutionContextFields
                                context={data.context ?? {}}
                                onChange={onChange}
                                allowPipelineDefaults
                                showThroughput={stepType === STEP_TYPE.LOAD}
                                errors={errors}
                                compact={compact}
                            />
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </>
    );
}

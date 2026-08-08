import type { ChangeEvent, ReactNode } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button, Input, Label } from '@vendure/dashboard';
import { Trash2 } from 'lucide-react';

import type { StepConfig } from '../../../constants/steps';
import type { AdapterMetadata } from '../../../hooks';
import type { PipelineTrigger, StepType } from '../../../types';
import { getAdapterTypeLabel } from '../../../utils';
import {
    ADAPTER_TYPES,
    FALLBACK_COLORS,
    PANEL_VARIANT,
    STEP_TYPE,
} from '../../../constants';
import { TriggerForm } from '../trigger-config';
import { AdapterRequiredWarning } from './AdapterRequiredWarning';
import { AdapterSelector } from './AdapterSelector';
import { MultiOperatorEditor } from './AdvancedEditors';
import { OperatorCheatSheetButton } from './OperatorCheatSheetButton';
import { hasSpecialConfigEditor } from './special-config-editors';
import type { StepConfigData } from './step-config-panel.types';

interface StepConfigBasicsProps {
    readonly data: StepConfigData;
    readonly stepType: StepType;
    readonly stepPresentation: StepConfig | undefined;
    readonly adapterType: string | null;
    readonly adapterCode: string | undefined;
    readonly availableAdapters: AdapterMetadata[];
    readonly selectedAdapter: AdapterMetadata | undefined;
    readonly triggerValue: PipelineTrigger;
    readonly variant: 'panel' | 'inline';
    readonly compact: boolean;
    readonly showHeader: boolean;
    readonly showKeyInput: boolean;
    readonly showDeleteButton: boolean;
    readonly showCheatSheet: boolean;
    readonly needsAdapterSelection: boolean;
    readonly isLoadingCatalog: boolean;
    readonly catalogError: Error | null | undefined;
    readonly stepKeyId: string;
    readonly adapterId: string;
    readonly onDelete: (() => void) | undefined;
    readonly onKeyChange: (key: string) => void;
    readonly onAdapterCodeChange: (code: string) => void;
    readonly onOperatorsChange: (
        operators: Array<{ op: string; args?: Record<string, unknown> }>,
    ) => void;
    readonly onTriggerChange: (trigger: PipelineTrigger) => void;
}

export function StepConfigBasics(props: StepConfigBasicsProps) {
    return (
        <>
            <StepHeader {...props} />
            <StepKeyField {...props} />
            {props.stepType === STEP_TYPE.TRIGGER && (
                <TriggerForm
                    trigger={props.triggerValue}
                    onChange={props.onTriggerChange}
                    compact={props.compact}
                />
            )}
            <AdapterConfiguration {...props} />
        </>
    );
}

function StepHeader({
    stepType,
    stepPresentation,
    selectedAdapter,
    adapterType,
    compact,
    showHeader,
    showCheatSheet,
    showDeleteButton,
    onDelete,
}: StepConfigBasicsProps) {
    const { t } = useLingui();
    if (!showHeader) return null;
    const Icon = selectedAdapter?.icon;

    return (
        <div
            className={compact ? 'p-3 rounded-lg mb-3' : 'p-4 rounded-lg mb-4'}
            style={{
                backgroundColor: stepPresentation?.bgColor ?? FALLBACK_COLORS.UNKNOWN_STEP_BG,
            }}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                        style={{
                            backgroundColor: selectedAdapter?.color
                                ?? stepPresentation?.color
                                ?? FALLBACK_COLORS.UNKNOWN_STEP_COLOR,
                        }}
                    >
                        {Icon ? <Icon className="h-4 w-4" /> : stepType.charAt(0)}
                    </div>
                    <div>
                        <h3
                            className={compact ? 'font-medium text-sm' : 'font-semibold'}
                            style={{ color: stepPresentation?.color }}
                        >
                            {t`${stepPresentation?.label ?? stepType} Step`}
                        </h3>
                        {!compact && (
                            <p className="text-sm text-muted-foreground">
                                {stepPresentation?.description}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {showCheatSheet && adapterType === ADAPTER_TYPES.OPERATOR && (
                        <OperatorCheatSheetButton label={compact ? undefined : t`Help`} />
                    )}
                    {showDeleteButton && onDelete && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={onDelete}
                            aria-label={t`Remove step`}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

function StepKeyField({
    data,
    variant,
    compact,
    showKeyInput,
    stepKeyId,
    onKeyChange,
}: StepConfigBasicsProps) {
    const { t } = useLingui();
    if (!showKeyInput) return null;
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => onKeyChange(event.target.value);

    return (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
            <Label htmlFor={stepKeyId} className={compact ? 'text-xs' : 'text-sm'}>
                {variant === PANEL_VARIANT.PANEL ? t`Node label` : t`Step key`}
            </Label>
            <Input
                id={stepKeyId}
                value={data.key}
                onChange={handleChange}
                placeholder="unique-step-key"
                className={compact ? 'h-8 font-mono' : 'font-mono'}
            />
            {!compact && (
                <p className="text-xs text-muted-foreground">
                    <Trans>Unique identifier for this step in the pipeline</Trans>
                </p>
            )}
        </div>
    );
}

function AdapterConfiguration(props: StepConfigBasicsProps) {
    const { t } = useLingui();
    const {
        data,
        stepType,
        adapterType,
        adapterCode,
        availableAdapters,
        selectedAdapter,
        compact,
        showCheatSheet,
        showHeader,
        needsAdapterSelection,
        isLoadingCatalog,
        catalogError,
        adapterId,
        onAdapterCodeChange,
        onOperatorsChange,
    } = props;

    if (!adapterType || stepType === STEP_TYPE.TRIGGER) return null;
    const typeLabel = getAdapterTypeLabel(adapterType);

    if (isLoadingCatalog) {
        return (
            <CatalogMessage variant="loading">
                {t`Loading ${typeLabel.toLowerCase()}s...`}
            </CatalogMessage>
        );
    }
    if (catalogError) {
        return (
            <CatalogMessage error>
                <Trans>The adapter catalog could not be loaded. Reload the page to try again.</Trans>
            </CatalogMessage>
        );
    }
    if (availableAdapters.length === 0) {
        return (
            <CatalogMessage>
                {stepType === STEP_TYPE.TRANSFORM
                    ? t`No transform operators are registered.`
                    : t`No ${typeLabel.toLowerCase()}s are registered.`}
            </CatalogMessage>
        );
    }
    if (stepType === STEP_TYPE.TRANSFORM) {
        return (
            <MultiOperatorEditor
                operators={Array.isArray(data.config.operators) ? data.config.operators : []}
                availableOperators={availableAdapters.map(adapter => ({
                    code: adapter.code,
                    name: adapter.name,
                    description: adapter.description,
                    schema: {
                        fields: adapter.schema.fields.map(field => ({
                            ...field,
                            defaultValue: field.default,
                        })),
                    },
                }))}
                onChange={onOperatorsChange}
            />
        );
    }
    if (hasSpecialConfigEditor(stepType)) return null;

    return (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
            <div className="flex items-center justify-between">
                <Label htmlFor={adapterId} className={compact ? 'text-xs' : 'text-sm'}>
                    {typeLabel}
                </Label>
                {showCheatSheet && adapterType === ADAPTER_TYPES.OPERATOR && !showHeader && (
                    <OperatorCheatSheetButton />
                )}
            </div>
            {needsAdapterSelection && (
                <AdapterRequiredWarning
                    adapterTypeLabel={typeLabel.toLowerCase()}
                    compact={compact}
                />
            )}
            <AdapterSelector
                id={adapterId}
                stepType={stepType}
                value={adapterCode}
                onChange={onAdapterCodeChange}
                placeholder={t`Select ${typeLabel.toLowerCase()}...`}
                adapters={availableAdapters}
            />
            {selectedAdapter && <SelectedAdapterSummary adapter={selectedAdapter} />}
        </div>
    );
}

function CatalogMessage({
    children,
    error = false,
    variant = 'empty',
}: {
    readonly children: ReactNode;
    readonly error?: boolean;
    readonly variant?: 'loading' | 'empty';
}) {
    const className = error
        ? 'p-3 rounded-md border border-destructive/30 bg-destructive/5'
        : variant === 'loading'
            ? 'p-3 bg-muted rounded-md'
            : 'p-3 rounded-md border bg-muted/30';
    return (
        <div className={className}>
            <p className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                {children}
            </p>
        </div>
    );
}

function SelectedAdapterSummary({ adapter }: { readonly adapter: AdapterMetadata }) {
    const Icon = adapter.icon;
    return (
        <div className="flex items-start gap-2 p-2 bg-muted/50 rounded border">
            <div
                className="w-7 h-7 rounded flex items-center justify-center text-white shrink-0 mt-0.5"
                style={{ backgroundColor: adapter.color }}
            >
                <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{adapter.name}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">
                    {adapter.description}
                </div>
            </div>
        </div>
    );
}

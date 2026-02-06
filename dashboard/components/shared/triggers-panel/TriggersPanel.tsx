import * as React from 'react';
import { useCallback, memo } from 'react';
import { Button, Switch } from '@vendure/dashboard';
import { Plus, Trash2, Play } from 'lucide-react';
import type { PipelineTrigger, TriggersPanelProps } from '../../../types';
import type { TriggerType } from '../../../constants';
import { TRIGGER_TYPE_CONFIGS, TRIGGER_ICONS, TRIGGER_TYPES } from '../../../constants';
import { TriggerForm } from '../trigger-config';
import { EmptyState } from '../feedback';
import { useStableKeys } from '../../../hooks';

export type { TriggersPanelProps };

// Memoized trigger item component to avoid inline handlers in map
interface CompactTriggerItemProps {
    readonly trigger: PipelineTrigger;
    readonly index: number;
    readonly readOnly: boolean;
    readonly secretCodes: string[];
    readonly onUpdate: (index: number, trigger: PipelineTrigger) => void;
    readonly onRemove: (index: number) => void;
}

const CompactTriggerItem = memo(function CompactTriggerItem({
    trigger,
    index,
    readOnly,
    secretCodes,
    onUpdate,
    onRemove,
}: CompactTriggerItemProps) {
    const Icon = TRIGGER_ICONS[trigger.type] ?? Play;

    const handleEnabledChange = useCallback((enabled: boolean) => {
        onUpdate(index, { ...trigger, enabled });
    }, [onUpdate, index, trigger]);

    const handleRemove = useCallback(() => {
        onRemove(index);
    }, [onRemove, index]);

    const handleFormChange = useCallback((t: PipelineTrigger) => {
        onUpdate(index, t);
    }, [onUpdate, index]);

    return (
        <div className="border rounded-md p-3 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm capitalize">{trigger.type}</span>
                </div>
                <div className="flex items-center gap-2">
                    <Switch
                        checked={trigger.enabled !== false}
                        onCheckedChange={handleEnabledChange}
                        disabled={readOnly}
                    />
                    {!readOnly && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive"
                            onClick={handleRemove}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>
            <TriggerForm
                trigger={trigger}
                onChange={handleFormChange}
                readOnly={readOnly}
                secretCodes={secretCodes}
                compact
            />
        </div>
    );
});

// Memoized trigger item for full variant
interface FullTriggerItemProps {
    readonly trigger: PipelineTrigger;
    readonly index: number;
    readonly readOnly: boolean;
    readonly secretCodes: string[];
    readonly onUpdate: (index: number, trigger: PipelineTrigger) => void;
    readonly onRemove: (index: number) => void;
}

const FullTriggerItem = memo(function FullTriggerItem({
    trigger,
    index,
    readOnly,
    secretCodes,
    onUpdate,
    onRemove,
}: FullTriggerItemProps) {
    const handleFormChange = useCallback((t: PipelineTrigger) => {
        onUpdate(index, t);
    }, [onUpdate, index]);

    const handleRemove = useCallback(() => {
        onRemove(index);
    }, [onRemove, index]);

    return (
        <TriggerForm
            trigger={trigger}
            onChange={handleFormChange}
            onRemove={handleRemove}
            readOnly={readOnly}
            secretCodes={secretCodes}
        />
    );
});

// Memoized add trigger button
interface AddTriggerButtonProps {
    readonly config: { type: TriggerType; label: string; description: string };
    readonly onAdd: (type: TriggerType) => void;
}

const AddTriggerButton = memo(function AddTriggerButton({ config, onAdd }: AddTriggerButtonProps) {
    const Icon = TRIGGER_ICONS[config.type];
    const handleClick = useCallback(() => {
        onAdd(config.type);
    }, [onAdd, config.type]);

    return (
        <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs justify-start"
            onClick={handleClick}
            title={config.description}
        >
            <Icon className="h-3 w-3 mr-1" />
            <span>{config.label}</span>
        </Button>
    );
});

export function TriggersPanel(props: TriggersPanelProps) {
    const {
        triggers,
        readOnly = false,
        secretCodes = [],
        variant = 'full',
    } = props;

    const triggerKeys = useStableKeys(triggers, 'trigger');
    const isOnChangeMode = 'onChange' in props && typeof props.onChange === 'function';

    const handleAddTrigger = useCallback((type: TriggerType = TRIGGER_TYPES.MANUAL) => {
        if (isOnChangeMode) {
            const newTrigger: PipelineTrigger = { type, enabled: true };
            if (type === TRIGGER_TYPES.SCHEDULE) {
                newTrigger.cron = '0 0 * * *';
            }
            (props as { onChange: (triggers: PipelineTrigger[]) => void }).onChange([...triggers, newTrigger]);
        } else {
            (props as { addTrigger: () => void }).addTrigger();
        }
    }, [isOnChangeMode, triggers, props]);

    const handleUpdateTrigger = useCallback((index: number, trigger: PipelineTrigger) => {
        if (isOnChangeMode) {
            const newTriggers = [...triggers];
            newTriggers[index] = trigger;
            (props as { onChange: (triggers: PipelineTrigger[]) => void }).onChange(newTriggers);
        } else {
            (props as { updateTrigger: (index: number, trigger: PipelineTrigger) => void }).updateTrigger(index, trigger);
        }
    }, [isOnChangeMode, triggers, props]);

    const handleRemoveTrigger = useCallback((index: number) => {
        if (isOnChangeMode) {
            (props as { onChange: (triggers: PipelineTrigger[]) => void }).onChange(triggers.filter((_, i) => i !== index));
        } else {
            (props as { removeTrigger: (index: number) => void }).removeTrigger(index);
        }
    }, [isOnChangeMode, triggers, props]);

    // Memoized handler for empty state action
    const handleAddDefaultTrigger = useCallback(() => {
        handleAddTrigger();
    }, [handleAddTrigger]);

    if (variant === 'compact') {
        return (
            <div className="flex flex-col h-full">
                <div className="p-3 border-b bg-muted/50">
                    <h3 className="font-semibold text-sm">Pipeline Triggers</h3>
                    <p className="text-xs text-muted-foreground">When should this pipeline run?</p>
                </div>

                <div className="flex-1 overflow-auto p-2 space-y-2">
                    {triggers.map((trigger, index) => (
                        <CompactTriggerItem
                            key={triggerKeys[index]}
                            trigger={trigger}
                            index={index}
                            readOnly={readOnly}
                            secretCodes={secretCodes}
                            onUpdate={handleUpdateTrigger}
                            onRemove={handleRemoveTrigger}
                        />
                    ))}

                    {triggers.length === 0 && (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                            No triggers configured. Add a trigger below.
                        </div>
                    )}
                </div>

                {!readOnly && (
                    <div className="p-3 border-t bg-muted/50">
                        <p className="text-xs text-muted-foreground mb-2">Add Trigger:</p>
                        <div className="grid grid-cols-2 gap-1">
                            {Object.values(TRIGGER_TYPE_CONFIGS).map((config) => (
                                <AddTriggerButton
                                    key={config.type}
                                    config={config}
                                    onAdd={handleAddTrigger}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (triggers.length === 0) {
        return (
            <EmptyState
                title="No triggers configured"
                description="Add triggers to run this pipeline automatically"
                action={!readOnly ? { label: 'Add Trigger', onClick: handleAddDefaultTrigger } : undefined}
            />
        );
    }

    return (
        <div className="space-y-4">
            {!readOnly && (
                <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={handleAddDefaultTrigger}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Trigger
                    </Button>
                </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
                {triggers.map((trigger, index) => (
                    <FullTriggerItem
                        key={triggerKeys[index]}
                        trigger={trigger}
                        index={index}
                        readOnly={readOnly}
                        secretCodes={secretCodes}
                        onUpdate={handleUpdateTrigger}
                        onRemove={handleRemoveTrigger}
                    />
                ))}
            </div>
        </div>
    );
}

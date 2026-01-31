import * as React from 'react';
import { useCallback, useRef } from 'react';
import { Button, Switch } from '@vendure/dashboard';
import { Plus, Trash2, Play } from 'lucide-react';
import type { PipelineTrigger, TriggersPanelProps } from '../../../types';
import type { TriggerType } from '../../../constants';
import { TRIGGER_TYPE_CONFIGS, TRIGGER_ICONS, TRIGGER_TYPES } from '../../../constants';
import { TriggerForm } from '../trigger-config';
import { EmptyState } from '../feedback';
import { generateStableKey } from '../../../utils';

export type { TriggersPanelProps };

function useTriggerKeys(triggers: PipelineTrigger[]): string[] {
    const keysRef = useRef<Map<PipelineTrigger, string>>(new Map());
    const prevTriggersRef = useRef<PipelineTrigger[]>([]);

    if (prevTriggersRef.current !== triggers) {
        const newMap = new Map<PipelineTrigger, string>();
        for (const trigger of triggers) {
            const existingKey = keysRef.current.get(trigger);
            newMap.set(trigger, existingKey ?? generateStableKey('trigger'));
        }
        keysRef.current = newMap;
        prevTriggersRef.current = triggers;
    }

    return triggers.map(t => keysRef.current.get(t) ?? generateStableKey('trigger'));
}

export function TriggersPanel(props: TriggersPanelProps) {
    const {
        triggers,
        readOnly = false,
        secretCodes = [],
        variant = 'full',
    } = props;

    const triggerKeys = useTriggerKeys(triggers);
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

    if (variant === 'compact') {
        return (
            <div className="flex flex-col h-full">
                <div className="p-3 border-b bg-muted/50">
                    <h3 className="font-semibold text-sm">Pipeline Triggers</h3>
                    <p className="text-xs text-muted-foreground">When should this pipeline run?</p>
                </div>

                <div className="flex-1 overflow-auto p-2 space-y-2">
                    {triggers.map((trigger, index) => {
                        const Icon = TRIGGER_ICONS[trigger.type] ?? Play;
                        return (
                            <div key={triggerKeys[index]} className="border rounded-md p-3 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Icon className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium text-sm capitalize">{trigger.type}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={trigger.enabled !== false}
                                            onCheckedChange={(enabled) => handleUpdateTrigger(index, { ...trigger, enabled })}
                                            disabled={readOnly}
                                        />
                                        {!readOnly && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-destructive"
                                                onClick={() => handleRemoveTrigger(index)}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <TriggerForm
                                    trigger={trigger}
                                    onChange={(t) => handleUpdateTrigger(index, t)}
                                    readOnly={readOnly}
                                    secretCodes={secretCodes}
                                    compact
                                />
                            </div>
                        );
                    })}

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
                            {Object.values(TRIGGER_TYPE_CONFIGS).map((config) => {
                                const Icon = TRIGGER_ICONS[config.type];
                                return (
                                    <Button
                                        key={config.type}
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs justify-start"
                                        onClick={() => handleAddTrigger(config.type)}
                                        title={config.description}
                                    >
                                        <Icon className="h-3 w-3 mr-1" />
                                        <span>{config.label}</span>
                                    </Button>
                                );
                            })}
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
                action={!readOnly ? { label: 'Add Trigger', onClick: () => handleAddTrigger() } : undefined}
            />
        );
    }

    return (
        <div className="space-y-4">
            {!readOnly && (
                <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => handleAddTrigger()}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Trigger
                    </Button>
                </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
                {triggers.map((trigger, index) => (
                    <TriggerForm
                        key={triggerKeys[index]}
                        trigger={trigger}
                        onChange={(t) => handleUpdateTrigger(index, t)}
                        onRemove={() => handleRemoveTrigger(index)}
                        readOnly={readOnly}
                        secretCodes={secretCodes}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * TriggerPanel Component
 * Configuration panel for pipeline triggers
 */

import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import { Plus, X, Zap } from 'lucide-react';
import type { TriggerPanelProps, TriggerConfig } from '../types/index';

export function TriggerPanel({ triggers, onChange }: TriggerPanelProps) {
    const addTrigger = () => {
        onChange([...triggers, { type: 'manual' }]);
    };

    const updateTrigger = (index: number, updates: Partial<TriggerConfig>) => {
        const newTriggers = [...triggers];
        newTriggers[index] = { ...newTriggers[index], ...updates };
        onChange(newTriggers);
    };

    const removeTrigger = (index: number) => {
        onChange(triggers.filter((_, i) => i !== index));
    };

    return (
        <Card>
            <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Triggers
                    </div>
                    <Button variant="outline" size="sm" onClick={addTrigger}>
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
                {triggers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No triggers configured. Pipeline will only run manually.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {triggers.map((trigger, index) => (
                            <div key={index} className="flex items-center gap-2 p-2 border rounded">
                                <Select value={trigger.type} onValueChange={v => updateTrigger(index, { type: v as TriggerConfig['type'] })}>
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="manual">Manual</SelectItem>
                                        <SelectItem value="schedule">Schedule</SelectItem>
                                        <SelectItem value="webhook">Webhook</SelectItem>
                                        <SelectItem value="event">Event</SelectItem>
                                    </SelectContent>
                                </Select>
                                {trigger.type === 'schedule' && (
                                    <Input
                                        value={trigger.cron || ''}
                                        onChange={e => updateTrigger(index, { cron: e.target.value })}
                                        placeholder="0 * * * *"
                                        className="flex-1 font-mono"
                                    />
                                )}
                                {trigger.type === 'webhook' && (
                                    <Input
                                        value={trigger.webhookPath || ''}
                                        onChange={e => updateTrigger(index, { webhookPath: e.target.value })}
                                        placeholder="/webhook/my-pipeline"
                                        className="flex-1"
                                    />
                                )}
                                {trigger.type === 'event' && (
                                    <Select value={trigger.eventType || ''} onValueChange={v => updateTrigger(index, { eventType: v })}>
                                        <SelectTrigger className="flex-1">
                                            <SelectValue placeholder="Select event" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ProductEvent">Product Changed</SelectItem>
                                            <SelectItem value="OrderStateTransitionEvent">Order State Changed</SelectItem>
                                            <SelectItem value="CustomerEvent">Customer Changed</SelectItem>
                                            <SelectItem value="StockMovementEvent">Stock Movement</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTrigger(index)}>
                                    <X className="w-3 h-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default TriggerPanel;

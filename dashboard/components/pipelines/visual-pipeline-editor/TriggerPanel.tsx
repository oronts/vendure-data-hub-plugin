import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@vendure/dashboard';
import { Plus, X, Zap, Lock, AlertTriangle, Key, Shield, User } from 'lucide-react';
import type { TriggerPanelProps, TriggerConfig, WebhookAuthType } from './types';

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

    const renderWebhookAuthConfig = (trigger: TriggerConfig, index: number) => {
        const authType = trigger.authentication || 'NONE';

        return (
            <div className="mt-2 space-y-2">
                {/* Auth Type Selector */}
                <div className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-muted-foreground" />
                    <Select
                        value={authType}
                        onValueChange={v => updateTrigger(index, { authentication: v as WebhookAuthType })}
                    >
                        <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue placeholder="Authentication" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="NONE">No Auth</SelectItem>
                            <SelectItem value="API_KEY">API Key</SelectItem>
                            <SelectItem value="HMAC">HMAC Signature</SelectItem>
                            <SelectItem value="BASIC">Basic Auth</SelectItem>
                            <SelectItem value="JWT">JWT Token</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Security Warning for NONE */}
                {authType === 'NONE' && (
                    <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
                        <AlertTriangle className="w-3 h-3 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <span className="text-yellow-700 dark:text-yellow-300">
                            No authentication. Anyone with the URL can trigger this pipeline.
                        </span>
                    </div>
                )}

                {/* API Key Config */}
                {authType === 'API_KEY' && (
                    <div className="space-y-2 p-2 border rounded bg-muted/30">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Key className="w-3 h-3" />
                            API Key Configuration
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Secret Code *</Label>
                            <Input
                                value={trigger.apiKeySecretCode || ''}
                                onChange={e => updateTrigger(index, { apiKeySecretCode: e.target.value })}
                                placeholder="my-api-key-secret"
                                className="h-7 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Header Name</Label>
                            <Input
                                value={trigger.apiKeyHeaderName || ''}
                                onChange={e => updateTrigger(index, { apiKeyHeaderName: e.target.value })}
                                placeholder="x-api-key"
                                className="h-7 text-xs"
                            />
                        </div>
                    </div>
                )}

                {/* HMAC Config */}
                {authType === 'HMAC' && (
                    <div className="space-y-2 p-2 border rounded bg-muted/30">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Shield className="w-3 h-3" />
                            HMAC Configuration
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Secret Code *</Label>
                            <Input
                                value={trigger.secretCode || ''}
                                onChange={e => updateTrigger(index, { secretCode: e.target.value })}
                                placeholder="my-hmac-secret"
                                className="h-7 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Signature Header</Label>
                            <Input
                                value={trigger.hmacHeaderName || ''}
                                onChange={e => updateTrigger(index, { hmacHeaderName: e.target.value })}
                                placeholder="x-datahub-signature"
                                className="h-7 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Algorithm</Label>
                            <Select
                                value={trigger.hmacAlgorithm || 'sha256'}
                                onValueChange={v => updateTrigger(index, { hmacAlgorithm: v as 'sha256' | 'sha512' })}
                            >
                                <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sha256">SHA-256</SelectItem>
                                    <SelectItem value="sha512">SHA-512</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}

                {/* Basic Auth Config */}
                {authType === 'BASIC' && (
                    <div className="space-y-2 p-2 border rounded bg-muted/30">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="w-3 h-3" />
                            Basic Auth Configuration
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Credentials Secret Code *</Label>
                            <Input
                                value={trigger.basicSecretCode || ''}
                                onChange={e => updateTrigger(index, { basicSecretCode: e.target.value })}
                                placeholder="my-basic-auth-secret"
                                className="h-7 text-xs"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Secret should contain "username:password" format
                            </p>
                        </div>
                    </div>
                )}

                {/* JWT Config */}
                {authType === 'JWT' && (
                    <div className="space-y-2 p-2 border rounded bg-muted/30">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Key className="w-3 h-3" />
                            JWT Configuration
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">JWT Secret Code *</Label>
                            <Input
                                value={trigger.jwtSecretCode || ''}
                                onChange={e => updateTrigger(index, { jwtSecretCode: e.target.value })}
                                placeholder="my-jwt-secret"
                                className="h-7 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Authorization Header</Label>
                            <Input
                                value={trigger.jwtHeaderName || ''}
                                onChange={e => updateTrigger(index, { jwtHeaderName: e.target.value })}
                                placeholder="Authorization"
                                className="h-7 text-xs"
                            />
                        </div>
                    </div>
                )}
            </div>
        );
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
                    <div className="space-y-3">
                        {triggers.map((trigger, index) => (
                            <div key={index} className="p-2 border rounded">
                                <div className="flex items-center gap-2">
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

                                {/* Webhook Authentication Config */}
                                {trigger.type === 'webhook' && (
                                    <Accordion type="single" collapsible className="mt-2">
                                        <AccordionItem value="auth" className="border-0">
                                            <AccordionTrigger className="py-1 text-xs hover:no-underline">
                                                <span className="flex items-center gap-1">
                                                    <Lock className="w-3 h-3" />
                                                    Authentication & Security
                                                    {trigger.authentication && trigger.authentication !== 'NONE' && (
                                                        <span className="ml-1 px-1.5 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded text-[10px]">
                                                            {trigger.authentication}
                                                        </span>
                                                    )}
                                                </span>
                                            </AccordionTrigger>
                                            <AccordionContent className="pt-2 pb-0">
                                                {renderWebhookAuthConfig(trigger, index)}
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default TriggerPanel;

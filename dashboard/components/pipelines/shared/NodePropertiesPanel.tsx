import * as React from 'react';
import type { Node } from '@xyflow/react';
import {
    Button,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    ScrollArea,
    Separator,
    Switch,
    Textarea,
} from '@vendure/dashboard';
import {
    Trash2,
    Settings2,
    AlertTriangle,
    Clock,
    Webhook,
    Zap,
    MousePointerClick,
} from 'lucide-react';

import { SchemaFormRenderer, FormSchemaField as SchemaField } from '../../common';
import { useAdapterCatalog, AdapterMetadata } from '../../../hooks/index';
import { OperatorCheatSheetButton } from './operator-cheatsheet';
import { AdvancedMapEditor, AdvancedTemplateEditor, AdvancedWhenEditor, MultiOperatorEditor } from './advanced-editors';
import { StepTester } from './step-tester';
import { TRIGGER_TYPES, CRON_PRESETS, type TriggerType } from '../../../constants/triggers';
import { VENDURE_EVENTS, VENDURE_EVENTS_BY_CATEGORY } from '../../../constants/events';

export type VisualNodeCategory =
    | 'trigger'
    | 'source'
    | 'transform'
    | 'validate'
    | 'condition'
    | 'load'
    | 'feed'
    | 'export'
    | 'sink'
    | 'enrich'
    | 'filter';

export interface PipelineNodeData {
    label: string;
    type: VisualNodeCategory;
    adapterCode?: string;
    config: Record<string, any>;
    status?: 'idle' | 'running' | 'success' | 'error';
    recordCount?: number;
    errorCount?: number;
}

export interface VendureEntitySchema {
    entity: string;
    label: string;
    description?: string;
    fields: Array<{
        key: string;
        type: string;
        required: boolean;
        readonly: boolean;
        description?: string;
    }>;
    lookupFields: string[];
    importable: boolean;
    exportable: boolean;
}

export interface NodePropertiesPanelProps {
    node: Node<PipelineNodeData> | null;
    onUpdate: (node: Node<PipelineNodeData>) => void;
    onDelete: () => void;
    onClose: () => void;
    catalog?: AdapterMetadata[];
    connectionCodes?: string[];
    secretOptions?: Array<{ code: string; provider?: string }>;
    vendureSchemas?: VendureEntitySchema[];
    panelWidth?: string;
    showCheatSheet?: boolean;
    showStepTester?: boolean;
    showAdvancedEditors?: boolean;
}

const CATEGORY_TO_ADAPTER_TYPE: Record<string, string> = {
    trigger: 'trigger',
    source: 'extractor',
    transform: 'operator',
    validate: 'validator',
    enrich: 'enricher',
    condition: 'router',
    load: 'loader',
    export: 'exporter',
    feed: 'feed',
    sink: 'sink',
    filter: 'operator',
};

const CATEGORY_TO_STEP_TYPE: Record<string, string> = {
    trigger: 'TRIGGER',
    source: 'EXTRACT',
    transform: 'TRANSFORM',
    validate: 'VALIDATE',
    condition: 'ROUTE',
    load: 'LOAD',
    feed: 'FEED',
    export: 'EXPORT',
    sink: 'SINK',
    enrich: 'ENRICH',
    filter: 'TRANSFORM',
};

function categoryToAdapterType(category: string): string {
    return CATEGORY_TO_ADAPTER_TYPE[category] ?? 'operator';
}

function categoryToStepType(category: string): string {
    return CATEGORY_TO_STEP_TYPE[category] ?? 'TRANSFORM';
}

export function NodePropertiesPanel({
    node,
    onUpdate,
    onDelete,
    onClose,
    catalog: externalCatalog,
    connectionCodes: externalConnectionCodes,
    secretOptions: externalSecretOptions,
    vendureSchemas = [],
    panelWidth = '420px',
    showCheatSheet = true,
    showStepTester = true,
    showAdvancedEditors = true,
}: NodePropertiesPanelProps) {
    const hookResult = useAdapterCatalog();
    const catalog = externalCatalog ?? hookResult.adapters;
    const connectionCodes = externalConnectionCodes ?? hookResult.connectionCodes;
    const secretOptions = externalSecretOptions ?? hookResult.secretOptions;

    const data = node?.data;
    const adapterType = data ? categoryToAdapterType(data.type) : 'operator';
    const stepTypeStr = data ? categoryToStepType(data.type) : 'TRANSFORM';
    const available = catalog.filter((a) => a.type === adapterType);
    const selectedAdapter = data ? catalog.find((a) => a.code === data.adapterCode) : undefined;

    const dynamicFields: SchemaField[] = React.useMemo(() => {
        const baseFields = selectedAdapter?.schema?.fields ?? [];
        return baseFields.map((f) => {
            if (f.key === 'connectionCode') {
                return {
                    ...f,
                    type: 'select',
                    options: connectionCodes.map((code) => ({ value: code, label: code })),
                } as SchemaField;
            }
            if (f.key.endsWith('SecretCode')) {
                return { ...f, type: 'secret' } as SchemaField;
            }
            return f;
        });
    }, [selectedAdapter, connectionCodes]);

    if (!node || !data) return null;

    const updateData = (updates: Partial<PipelineNodeData>) => {
        onUpdate({
            ...node,
            data: { ...data, ...updates },
        });
    };

    const updateConfig = (key: string, value: any) => {
        onUpdate({
            ...node,
            data: {
                ...data,
                config: { ...data.config, [key]: value },
            },
        });
    };

    const updateConfigBatch = (values: Record<string, unknown>) => {
        onUpdate({
            ...node,
            data: {
                ...data,
                config: { ...data.config, ...values, adapterCode: data.adapterCode },
            },
        });
    };

    return (
        <Sheet open={!!node} onOpenChange={() => onClose()}>
            <SheetContent
                className="overflow-y-auto p-0"
                style={{ width: panelWidth, maxWidth: '90vw' }}
            >
                <SheetHeader className="px-4 py-3 border-b bg-muted/30">
                    <SheetTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {selectedAdapter ? (
                                <div
                                    className="w-7 h-7 rounded flex items-center justify-center text-white"
                                    style={{ backgroundColor: selectedAdapter.color }}
                                >
                                    <selectedAdapter.icon className="w-3.5 h-3.5" />
                                </div>
                            ) : (
                                <Settings2 className="w-5 h-5" />
                            )}
                            <span className="text-base">Configure Node</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {showCheatSheet && <OperatorCheatSheetButton label="Help" />}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={onDelete}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </SheetTitle>
                </SheetHeader>

                <ScrollArea className="h-[calc(100vh-80px)]">
                    <div className="px-4 py-4 space-y-5">
                        <BasicSettingsSection
                            data={data}
                            updateData={updateData}
                            updateConfig={updateConfig}
                            selectedAdapter={selectedAdapter}
                            available={available}
                        />

                        {selectedAdapter?.schema?.fields?.length ? (
                            <>
                                <Separator />
                                <DynamicConfigSection
                                    data={data}
                                    dynamicFields={dynamicFields}
                                    updateConfigBatch={updateConfigBatch}
                                    secretOptions={secretOptions}
                                    selectedAdapter={selectedAdapter}
                                />
                            </>
                        ) : (
                            <>
                                {data.type === 'condition' && (
                                    <>
                                        <Separator />
                                        <ConditionConfig
                                            config={data.config}
                                            onChange={updateConfig}
                                        />
                                    </>
                                )}
                                {data.type === 'validate' && (
                                    <>
                                        <Separator />
                                        <ValidateConfig
                                            config={data.config}
                                            onChange={updateConfig}
                                        />
                                    </>
                                )}
                            </>
                        )}

                        {showAdvancedEditors && adapterType === 'operator' && (
                            <AdvancedEditorsSection
                                adapterCode={selectedAdapter?.code}
                                config={data.config || {}}
                                updateConfigBatch={updateConfigBatch}
                            />
                        )}

                        {showStepTester && data.type !== 'trigger' && (
                            <>
                                <Separator />
                                <StepTester
                                    stepType={stepTypeStr}
                                    adapterType={adapterType}
                                    config={{ adapterCode: data.adapterCode, ...(data.config || {}) }}
                                />
                            </>
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

interface BasicSettingsSectionProps {
    data: PipelineNodeData;
    updateData: (updates: Partial<PipelineNodeData>) => void;
    updateConfig: (key: string, value: any) => void;
    selectedAdapter: AdapterMetadata | undefined;
    available: AdapterMetadata[];
}

function BasicSettingsSection({
    data,
    updateData,
    updateConfig,
    selectedAdapter,
    available,
}: BasicSettingsSectionProps) {
    return (
        <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Basic Settings
            </h4>

            <div className="space-y-1.5">
                <Label className="text-xs">Node Label</Label>
                <Input
                    value={data.label}
                    onChange={(e) => updateData({ label: e.target.value })}
                    className="h-8"
                />
            </div>

            {!data.adapterCode &&
                data.type !== 'trigger' &&
                !(
                    data.type === 'transform' &&
                    Array.isArray(data.config?.operators) &&
                    data.config.operators.length > 0
                ) && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md">
                        <div className="flex items-center gap-2 text-amber-800">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span className="text-sm font-medium">Select an adapter</span>
                        </div>
                        <p className="text-xs text-amber-700 mt-1 ml-6">
                            This step requires an adapter to be configured.
                        </p>
                    </div>
                )}

            {data.type === 'trigger' && (
                <TriggerConfigSection
                    config={data.config}
                    onChange={updateConfig}
                />
            )}

            {data.type === 'transform' && (
                <MultiOperatorEditor
                    operators={Array.isArray(data.config?.operators) ? data.config.operators : []}
                    availableOperators={available.map(a => ({ code: a.code, name: a.name, description: a.description }))}
                    onChange={(operators) => {
                        updateData({
                            config: { operators },
                        });
                    }}
                />
            )}

            {data.type !== 'trigger' && data.type !== 'transform' && (
                <div className="space-y-1.5">
                    <Label className="text-xs">Adapter</Label>
                    <Select
                        value={selectedAdapter?.code || ''}
                        onValueChange={(code) => {
                            if (code !== data.adapterCode) {
                                updateData({ adapterCode: code, config: { adapterCode: code } });
                            }
                        }}
                    >
                        <SelectTrigger
                            className={`h-8 ${!data.adapterCode ? 'border-amber-300' : ''}`}
                        >
                            <SelectValue placeholder="Select adapter" />
                        </SelectTrigger>
                        <SelectContent>
                            {available.map((a) => {
                                const Icon = a.icon;
                                return (
                                    <SelectItem key={a.code} value={a.code}>
                                        <div className="flex items-center gap-2">
                                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                                            <div>
                                                <div className="font-medium text-sm">{a.name}</div>
                                                {a.description && (
                                                    <div className="text-xs text-muted-foreground">
                                                        {a.description}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                </div>
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
}

interface TriggerConfigSectionProps {
    config: Record<string, any>;
    onChange: (key: string, value: any) => void;
}

const TRIGGER_TYPE_ICONS = {
    manual: MousePointerClick,
    schedule: Clock,
    webhook: Webhook,
    event: Zap,
};

function TriggerConfigSection({ config, onChange }: TriggerConfigSectionProps) {
    const triggerType = (config?.type as TriggerType) || 'manual';
    const TriggerIcon = TRIGGER_TYPE_ICONS[triggerType] || MousePointerClick;

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-xs">Trigger Type</Label>
                <Select
                    value={triggerType}
                    onValueChange={(v) => onChange('type', v)}
                >
                    <SelectTrigger className="h-8">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="manual">
                            <div className="flex items-center gap-2">
                                <MousePointerClick className="w-3.5 h-3.5" />
                                <span>Manual</span>
                            </div>
                        </SelectItem>
                        <SelectItem value="schedule">
                            <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Schedule (Cron)</span>
                            </div>
                        </SelectItem>
                        <SelectItem value="webhook">
                            <div className="flex items-center gap-2">
                                <Webhook className="w-3.5 h-3.5" />
                                <span>Webhook</span>
                            </div>
                        </SelectItem>
                        <SelectItem value="event">
                            <div className="flex items-center gap-2">
                                <Zap className="w-3.5 h-3.5" />
                                <span>Vendure Event</span>
                            </div>
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="p-2.5 bg-muted/50 rounded border flex items-center gap-2">
                <TriggerIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                    {triggerType === 'manual' && 'Pipeline will be started manually from the dashboard.'}
                    {triggerType === 'schedule' && 'Pipeline runs automatically on a cron schedule.'}
                    {triggerType === 'webhook' && 'Pipeline triggered via HTTP POST request.'}
                    {triggerType === 'event' && 'Pipeline reacts to Vendure system events.'}
                </p>
            </div>

            {triggerType === 'schedule' && (
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Schedule Preset</Label>
                        <Select
                            value=""
                            onValueChange={(v) => onChange('cron', v)}
                        >
                            <SelectTrigger className="h-8">
                                <SelectValue placeholder="Select preset..." />
                            </SelectTrigger>
                            <SelectContent>
                                {CRON_PRESETS.map((preset) => (
                                    <SelectItem key={preset.cron} value={preset.cron}>
                                        <div>
                                            <div className="font-medium text-sm">{preset.label}</div>
                                            <div className="text-xs text-muted-foreground">{preset.description}</div>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Cron Expression</Label>
                        <Input
                            value={config?.cron || ''}
                            onChange={(e) => onChange('cron', e.target.value)}
                            placeholder="0 * * * *"
                            className="h-8 font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                            Format: minute hour day month weekday
                        </p>
                    </div>
                </div>
            )}

            {triggerType === 'webhook' && (
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Webhook Code</Label>
                        <Input
                            value={config?.webhookCode || ''}
                            onChange={(e) => onChange('webhookCode', e.target.value)}
                            placeholder="my-webhook"
                            className="h-8"
                        />
                        <p className="text-xs text-muted-foreground">
                            POST to: /data-hub/webhook/{config?.webhookCode || '{code}'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={config?.authentication !== 'NONE'}
                            onCheckedChange={(v) => onChange('authentication', v ? 'HMAC' : 'NONE')}
                        />
                        <Label className="text-xs">Require authentication</Label>
                    </div>

                    {/* Authentication Configuration */}
                    {config?.authentication !== 'NONE' && (
                        <WebhookAuthConfig config={config} onChange={onChange} />
                    )}
                </div>
            )}

            {triggerType === 'event' && (
                <div className="space-y-1.5">
                    <Label className="text-xs">Vendure Event</Label>
                    <Select
                        value={config?.event || ''}
                        onValueChange={(v) => onChange('event', v)}
                    >
                        <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select event..." />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(VENDURE_EVENTS_BY_CATEGORY).map(([category, events]) => (
                                <React.Fragment key={category}>
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                                        {category}
                                    </div>
                                    {events.map((e) => (
                                        <SelectItem key={e.event} value={e.event}>
                                            <div>
                                                <div className="font-medium text-sm">{e.label}</div>
                                                <div className="text-xs text-muted-foreground">{e.description}</div>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </React.Fragment>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
        </div>
    );
}

interface DynamicConfigSectionProps {
    data: PipelineNodeData;
    dynamicFields: SchemaField[];
    updateConfigBatch: (values: Record<string, unknown>) => void;
    secretOptions: Array<{ code: string; provider?: string }>;
    selectedAdapter: AdapterMetadata | undefined;
}

function DynamicConfigSection({
    data,
    dynamicFields,
    updateConfigBatch,
    secretOptions,
    selectedAdapter,
}: DynamicConfigSectionProps) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    Configuration
                </h4>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                        const defaults: Record<string, unknown> = {};
                        for (const f of dynamicFields) {
                            if (f.defaultValue !== undefined) {
                                defaults[f.key] = f.defaultValue;
                            }
                        }
                        updateConfigBatch(defaults);
                    }}
                >
                    Reset defaults
                </Button>
            </div>

            <SchemaFormRenderer
                fields={dynamicFields}
                values={data.config || {}}
                onChange={updateConfigBatch}
                secretOptions={secretOptions}
                groups={selectedAdapter?.schema?.groups as any}
                compact
            />

            {(() => {
                const cfg = (data.config || {}) as Record<string, unknown>;
                const missing = dynamicFields.filter(
                    (f) => f.required && (cfg[f.key] == null || cfg[f.key] === '')
                );
                return missing.length ? (
                    <p className="text-xs text-amber-600">
                        Missing required: {missing.map((m) => m.label || m.key).join(', ')}
                    </p>
                ) : null;
            })()}
        </div>
    );
}

interface AdvancedEditorsSectionProps {
    adapterCode: string | undefined;
    config: Record<string, unknown>;
    updateConfigBatch: (values: Record<string, unknown>) => void;
}

function AdvancedEditorsSection({
    adapterCode,
    config,
    updateConfigBatch,
}: AdvancedEditorsSectionProps) {
    if (adapterCode === 'map') {
        return <AdvancedMapEditor config={config} onChange={updateConfigBatch} />;
    }
    if (adapterCode === 'template') {
        return <AdvancedTemplateEditor config={config} onChange={updateConfigBatch} />;
    }
    if (adapterCode === 'when') {
        return <AdvancedWhenEditor config={config} onChange={updateConfigBatch} />;
    }
    return null;
}

interface ConfigSectionProps {
    config: Record<string, any>;
    onChange: (key: string, value: any) => void;
}

type WebhookAuthType = 'NONE' | 'API_KEY' | 'HMAC' | 'BASIC' | 'JWT';

function WebhookAuthConfig({ config, onChange }: ConfigSectionProps) {
    const authType = (config?.authentication as WebhookAuthType) || 'HMAC';

    return (
        <div className="space-y-3 p-3 border rounded-md bg-muted/30">
            <div className="space-y-1.5">
                <Label className="text-xs font-medium">Authentication Type</Label>
                <Select
                    value={authType}
                    onValueChange={(v) => onChange('authentication', v)}
                >
                    <SelectTrigger className="h-8">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="HMAC">
                            <div>
                                <div className="font-medium text-sm">HMAC Signature</div>
                                <div className="text-xs text-muted-foreground">Sign requests with shared secret</div>
                            </div>
                        </SelectItem>
                        <SelectItem value="API_KEY">
                            <div>
                                <div className="font-medium text-sm">API Key</div>
                                <div className="text-xs text-muted-foreground">Validate via header API key</div>
                            </div>
                        </SelectItem>
                        <SelectItem value="BASIC">
                            <div>
                                <div className="font-medium text-sm">Basic Auth</div>
                                <div className="text-xs text-muted-foreground">Username/password authentication</div>
                            </div>
                        </SelectItem>
                        <SelectItem value="JWT">
                            <div>
                                <div className="font-medium text-sm">JWT Token</div>
                                <div className="text-xs text-muted-foreground">Validate JWT bearer token</div>
                            </div>
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* HMAC Configuration */}
            {authType === 'HMAC' && (
                <div className="space-y-2">
                    <div className="space-y-1">
                        <Label className="text-xs">Secret Code *</Label>
                        <Input
                            value={config?.secretCode || ''}
                            onChange={(e) => onChange('secretCode', e.target.value)}
                            placeholder="my-hmac-secret"
                            className="h-7 text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Reference to a secret stored in Data Hub Secrets
                        </p>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Signature Header</Label>
                        <Input
                            value={config?.hmacHeaderName || 'x-datahub-signature'}
                            onChange={(e) => onChange('hmacHeaderName', e.target.value)}
                            placeholder="x-datahub-signature"
                            className="h-7 text-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Algorithm</Label>
                        <Select
                            value={config?.hmacAlgorithm || 'sha256'}
                            onValueChange={(v) => onChange('hmacAlgorithm', v)}
                        >
                            <SelectTrigger className="h-7 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="sha256">SHA-256 (Recommended)</SelectItem>
                                <SelectItem value="sha512">SHA-512</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {/* API Key Configuration */}
            {authType === 'API_KEY' && (
                <div className="space-y-2">
                    <div className="space-y-1">
                        <Label className="text-xs">Secret Code *</Label>
                        <Input
                            value={config?.apiKeySecretCode || ''}
                            onChange={(e) => onChange('apiKeySecretCode', e.target.value)}
                            placeholder="my-api-key-secret"
                            className="h-7 text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Reference to a secret stored in Data Hub Secrets
                        </p>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Header Name</Label>
                        <Input
                            value={config?.apiKeyHeaderName || 'x-api-key'}
                            onChange={(e) => onChange('apiKeyHeaderName', e.target.value)}
                            placeholder="x-api-key"
                            className="h-7 text-sm"
                        />
                    </div>
                </div>
            )}

            {/* Basic Auth Configuration */}
            {authType === 'BASIC' && (
                <div className="space-y-2">
                    <div className="space-y-1">
                        <Label className="text-xs">Credentials Secret Code *</Label>
                        <Input
                            value={config?.basicSecretCode || ''}
                            onChange={(e) => onChange('basicSecretCode', e.target.value)}
                            placeholder="my-basic-auth-secret"
                            className="h-7 text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Secret should contain "username:password" format
                        </p>
                    </div>
                </div>
            )}

            {/* JWT Configuration */}
            {authType === 'JWT' && (
                <div className="space-y-2">
                    <div className="space-y-1">
                        <Label className="text-xs">JWT Secret Code *</Label>
                        <Input
                            value={config?.jwtSecretCode || ''}
                            onChange={(e) => onChange('jwtSecretCode', e.target.value)}
                            placeholder="my-jwt-secret"
                            className="h-7 text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Secret used to verify JWT signature
                        </p>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Authorization Header</Label>
                        <Input
                            value={config?.jwtHeaderName || 'Authorization'}
                            onChange={(e) => onChange('jwtHeaderName', e.target.value)}
                            placeholder="Authorization"
                            className="h-7 text-sm"
                        />
                    </div>
                </div>
            )}

            <p className="text-[10px] text-muted-foreground mt-2">
                Configure authentication in Data Hub → Secrets to store sensitive credentials securely.
            </p>
        </div>
    );
}

function ConditionConfig({ config, onChange }: ConfigSectionProps) {
    return (
        <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Condition
            </h4>
            <div className="space-y-1.5">
                <Label className="text-xs">Expression</Label>
                <Input
                    value={config.expression || ''}
                    onChange={(e) => onChange('expression', e.target.value)}
                    placeholder="price > 100"
                    className="h-8"
                />
                <p className="text-xs text-muted-foreground">
                    Matching records go to TRUE output, others to FALSE
                </p>
            </div>
        </div>
    );
}

function ValidateConfig({ config, onChange }: ConfigSectionProps) {
    return (
        <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Validation
            </h4>
            <div className="space-y-1.5">
                <Label className="text-xs">Mode</Label>
                <Select
                    value={config.mode || 'strict'}
                    onValueChange={(v) => onChange('mode', v)}
                >
                    <SelectTrigger className="h-8">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="strict">Strict - Reject invalid</SelectItem>
                        <SelectItem value="permissive">Permissive - Allow with warnings</SelectItem>
                        <SelectItem value="coerce">Coerce - Try to fix types</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex items-center gap-2">
                <Switch
                    checked={config.stopOnError !== false}
                    onCheckedChange={(v) => onChange('stopOnError', v)}
                />
                <Label className="text-xs">Stop on validation error</Label>
            </div>
        </div>
    );
}

export default NodePropertiesPanel;

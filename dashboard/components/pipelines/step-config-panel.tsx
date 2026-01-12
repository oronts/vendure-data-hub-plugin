import * as React from 'react';
import {
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Button,
    Badge,
} from '@vendure/dashboard';
import { SchemaFormRenderer, FormSchemaField as SchemaField } from '../common';
import { STEP_CONFIGS, StepType } from '../../constants/index';
import { getAdapterType, getAdapterTypeLabel } from '../../utils/index';

// TYPES

export interface StepDefinition {
    key: string;
    type: StepType;
    name?: string;
    config: Record<string, unknown>;
    async?: boolean;
    throughput?: {
        batchSize?: number;
        rateLimitRps?: number;
    };
}

export interface AdapterInfo {
    type: string;
    code: string;
    description?: string;
    schema: {
        fields: SchemaField[];
    };
}

export interface StepConfigPanelProps {
    readonly step: StepDefinition;
    readonly adapters: readonly AdapterInfo[];
    readonly onChange: (step: StepDefinition) => void;
    readonly onRemove: () => void;
    readonly isFirst?: boolean;
    readonly isLast?: boolean;
    readonly onMoveUp?: () => void;
    readonly onMoveDown?: () => void;
    readonly errors?: readonly string[];
}

// MAIN COMPONENT

export function StepConfigPanel({
    step,
    adapters,
    onChange,
    onRemove,
    isFirst,
    isLast,
    onMoveUp,
    onMoveDown,
    errors = [],
}: StepConfigPanelProps) {
    const stepConfig = STEP_CONFIGS[step.type];
    const adapterType = getAdapterType(step.type);
    const availableAdapters = adapterType
        ? adapters.filter((a) => a.type === adapterType)
        : [];

    const selectedAdapter = availableAdapters.find(
        (a) => a.code === step.config?.adapterCode
    );

    const updateStep = (patch: Partial<StepDefinition>) => {
        onChange({ ...step, ...patch });
    };

    const updateConfig = (config: Record<string, unknown>) => {
        onChange({ ...step, config });
    };

    return (
        <div
            className="border rounded-lg overflow-hidden"
            style={{ borderColor: stepConfig?.borderColor }}
        >
            {/* Header */}
            <div
                className="px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: stepConfig?.bgColor }}
            >
                <div className="flex items-center gap-3">
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                        style={{ backgroundColor: stepConfig?.color }}
                    >
                        {step.type.charAt(0)}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <Input
                                value={step.key}
                                onChange={(e) => updateStep({ key: e.target.value })}
                                className="h-7 w-[180px] font-mono text-sm bg-white/80"
                                placeholder="step-key"
                            />
                            <Badge variant="outline" style={{ color: stepConfig?.color }}>
                                {stepConfig?.label || step.type}
                            </Badge>
                        </div>
                        {step.name && (
                            <p className="text-xs text-muted-foreground mt-1">{step.name}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onMoveUp}
                        disabled={isFirst}
                    >
                        ↑
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onMoveDown}
                        disabled={isLast}
                    >
                        ↓
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onRemove}>
                        ✕
                    </Button>
                </div>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
                <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20">
                    <ul className="text-sm text-destructive list-disc list-inside">
                        {errors.map((err, i) => (
                            <li key={i}>{err}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Configuration */}
            <div className="p-4 space-y-4">
                {/* Step type specific config */}
                {step.type === 'TRIGGER' ? (
                    <TriggerConfig
                        config={step.config}
                        onChange={updateConfig}
                    />
                ) : adapterType ? (
                    <AdapterConfig
                        adapters={availableAdapters}
                        selectedCode={step.config?.adapterCode as string}
                        config={step.config}
                        onChange={updateConfig}
                    />
                ) : step.type === 'ROUTE' ? (
                    <RouteConfig
                        config={step.config}
                        onChange={updateConfig}
                    />
                ) : step.type === 'VALIDATE' ? (
                    <ValidateConfig
                        config={step.config}
                        onChange={updateConfig}
                    />
                ) : (
                    <div className="text-sm text-muted-foreground">
                        Configure this step type...
                    </div>
                )}

                {/* Throughput settings (collapsible) */}
                <ThroughputSettings
                    async={step.async}
                    throughput={step.throughput}
                    onChange={(async, throughput) => updateStep({ async, throughput })}
                />
            </div>
        </div>
    );
}

// TRIGGER CONFIG

interface TriggerConfigProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
}

function TriggerConfig({ config, onChange }: TriggerConfigProps) {
    const triggerType = (config.type as string) || 'manual';

    const updateField = (key: string, value: unknown) => {
        onChange({ ...config, [key]: value });
    };

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <label className="text-sm font-medium">Trigger Type</label>
                <Select
                    value={triggerType}
                    onValueChange={(v) => updateField('type', v)}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="schedule">Schedule (Cron)</SelectItem>
                        <SelectItem value="webhook">Webhook</SelectItem>
                        <SelectItem value="event">Vendure Event</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {triggerType === 'schedule' && (
                <div className="space-y-1">
                    <label className="text-sm font-medium">Cron Expression</label>
                    <Input
                        value={(config.cron as string) || ''}
                        onChange={(e) => updateField('cron', e.target.value)}
                        placeholder="0 * * * *"
                        className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                        e.g., "0 * * * *" for every hour, "0 0 * * *" for daily at midnight
                    </p>
                </div>
            )}

            {triggerType === 'webhook' && (
                <>
                    <div className="space-y-1">
                        <label className="text-sm font-medium">Webhook Path</label>
                        <Input
                            value={(config.webhookPath as string) || ''}
                            onChange={(e) => updateField('webhookPath', e.target.value)}
                            placeholder="/my-webhook"
                        />
                        <p className="text-xs text-muted-foreground">
                            POST to: /data-hub/webhook/{(config.webhookPath as string) || '{path}'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={config.requireAuth !== false}
                            onCheckedChange={(v) => updateField('requireAuth', v)}
                        />
                        <label className="text-sm">Require authentication</label>
                    </div>

                    {/* Authentication Configuration */}
                    {config.requireAuth !== false && (
                        <WebhookAuthSection config={config} onChange={updateField} />
                    )}
                </>
            )}

            {triggerType === 'event' && (
                <div className="space-y-1">
                    <label className="text-sm font-medium">Event Type</label>
                    <Select
                        value={(config.eventType as string) || ''}
                        onValueChange={(v) => updateField('eventType', v)}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select event..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ProductEvent">Product Changed</SelectItem>
                            <SelectItem value="ProductVariantEvent">Variant Changed</SelectItem>
                            <SelectItem value="OrderStateTransitionEvent">Order State Changed</SelectItem>
                            <SelectItem value="StockMovementEvent">Stock Movement</SelectItem>
                            <SelectItem value="CustomerEvent">Customer Changed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}
        </div>
    );
}

// WEBHOOK AUTH SECTION

interface WebhookAuthSectionProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (key: string, value: unknown) => void;
}

type WebhookAuthType = 'HMAC' | 'API_KEY' | 'BASIC' | 'JWT';

function WebhookAuthSection({ config, onChange }: WebhookAuthSectionProps) {
    const authType = (config.authType as WebhookAuthType) || 'HMAC';

    return (
        <div className="space-y-3 p-3 border rounded-md bg-muted/30">
            <div className="space-y-1">
                <label className="text-sm font-medium">Authentication Type</label>
                <Select
                    value={authType}
                    onValueChange={(v) => onChange('authType', v)}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="HMAC">HMAC Signature</SelectItem>
                        <SelectItem value="API_KEY">API Key</SelectItem>
                        <SelectItem value="BASIC">Basic Auth</SelectItem>
                        <SelectItem value="JWT">JWT Token</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* HMAC Configuration */}
            {authType === 'HMAC' && (
                <div className="space-y-2">
                    <div className="space-y-1">
                        <label className="text-sm">Secret Code *</label>
                        <Input
                            value={(config.hmacSecretCode as string) || ''}
                            onChange={(e) => onChange('hmacSecretCode', e.target.value)}
                            placeholder="my-hmac-secret"
                        />
                        <p className="text-xs text-muted-foreground">
                            Reference to a secret in Data Hub → Secrets
                        </p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm">Signature Header</label>
                        <Input
                            value={(config.hmacHeader as string) || 'x-datahub-signature'}
                            onChange={(e) => onChange('hmacHeader', e.target.value)}
                            placeholder="x-datahub-signature"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm">Algorithm</label>
                        <Select
                            value={(config.hmacAlgorithm as string) || 'sha256'}
                            onValueChange={(v) => onChange('hmacAlgorithm', v)}
                        >
                            <SelectTrigger className="w-full">
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
                        <label className="text-sm">Secret Code *</label>
                        <Input
                            value={(config.apiKeySecretCode as string) || ''}
                            onChange={(e) => onChange('apiKeySecretCode', e.target.value)}
                            placeholder="my-api-key-secret"
                        />
                        <p className="text-xs text-muted-foreground">
                            Reference to a secret in Data Hub → Secrets
                        </p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm">Header Name</label>
                        <Input
                            value={(config.apiKeyHeader as string) || 'x-api-key'}
                            onChange={(e) => onChange('apiKeyHeader', e.target.value)}
                            placeholder="x-api-key"
                        />
                    </div>
                </div>
            )}

            {/* Basic Auth Configuration */}
            {authType === 'BASIC' && (
                <div className="space-y-2">
                    <div className="space-y-1">
                        <label className="text-sm">Credentials Secret Code *</label>
                        <Input
                            value={(config.basicSecretCode as string) || ''}
                            onChange={(e) => onChange('basicSecretCode', e.target.value)}
                            placeholder="my-basic-auth-secret"
                        />
                        <p className="text-xs text-muted-foreground">
                            Secret should contain "username:password" format
                        </p>
                    </div>
                </div>
            )}

            {/* JWT Configuration */}
            {authType === 'JWT' && (
                <div className="space-y-2">
                    <div className="space-y-1">
                        <label className="text-sm">JWT Secret Code *</label>
                        <Input
                            value={(config.jwtSecretCode as string) || ''}
                            onChange={(e) => onChange('jwtSecretCode', e.target.value)}
                            placeholder="my-jwt-secret"
                        />
                        <p className="text-xs text-muted-foreground">
                            Secret used to verify JWT signature
                        </p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm">Authorization Header</label>
                        <Input
                            value={(config.jwtHeader as string) || 'Authorization'}
                            onChange={(e) => onChange('jwtHeader', e.target.value)}
                            placeholder="Authorization"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ADAPTER CONFIG

interface AdapterConfigProps {
    readonly adapters: readonly AdapterInfo[];
    readonly selectedCode?: string;
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
}

function AdapterConfig({ adapters, selectedCode, config, onChange }: AdapterConfigProps) {
    const selectedAdapter = adapters.find((a) => a.code === selectedCode);

    const updateField = (key: string, value: unknown) => {
        onChange({ ...config, [key]: value });
    };

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <label className="text-sm font-medium">Adapter</label>
                <Select
                    value={selectedCode || ''}
                    onValueChange={(v) => updateField('adapterCode', v)}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select adapter..." />
                    </SelectTrigger>
                    <SelectContent>
                        {adapters.map((adapter) => (
                            <SelectItem key={adapter.code} value={adapter.code}>
                                <div className="flex flex-col">
                                    <span className="font-medium">{adapter.code}</span>
                                    {adapter.description && (
                                        <span className="text-xs text-muted-foreground">
                                            {adapter.description}
                                        </span>
                                    )}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {selectedAdapter && selectedAdapter.schema.fields.length > 0 && (
                <div className="pt-2 border-t">
                    <SchemaFormRenderer
                        fields={selectedAdapter.schema.fields}
                        values={config}
                        onChange={onChange}
                        compact
                    />
                </div>
            )}
        </div>
    );
}

// ROUTE CONFIG

interface RouteConfigProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
}

function RouteConfig({ config, onChange }: RouteConfigProps) {
    const branches = (config.branches as Array<{ name: string; conditions?: unknown[] }>) || [];

    const addBranch = () => {
        onChange({
            ...config,
            branches: [...branches, { name: `branch-${branches.length + 1}`, conditions: [] }],
        });
    };

    const updateBranch = (index: number, patch: Record<string, unknown>) => {
        const newBranches = [...branches];
        newBranches[index] = { ...newBranches[index], ...patch };
        onChange({ ...config, branches: newBranches });
    };

    const removeBranch = (index: number) => {
        onChange({ ...config, branches: branches.filter((_, i) => i !== index) });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Routing Branches</label>
                <Button size="sm" variant="outline" onClick={addBranch}>
                    Add Branch
                </Button>
            </div>

            {branches.map((branch, i) => (
                <div key={i} className="flex items-center gap-2 p-2 border rounded">
                    <Input
                        value={branch.name}
                        onChange={(e) => updateBranch(i, { name: e.target.value })}
                        className="flex-1"
                        placeholder="Branch name"
                    />
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeBranch(i)}
                    >
                        ✕
                    </Button>
                </div>
            ))}

            {branches.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    Add branches to route records based on conditions.
                </p>
            )}
        </div>
    );
}

// VALIDATE CONFIG

interface ValidateConfigProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
}

function ValidateConfig({ config, onChange }: ValidateConfigProps) {
    const mode = (config.mode as string) || 'fail-fast';

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <label className="text-sm font-medium">Validation Mode</label>
                <Select
                    value={mode}
                    onValueChange={(v) => onChange({ ...config, mode: v })}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="fail-fast">Fail Fast (stop on first error)</SelectItem>
                        <SelectItem value="accumulate">Accumulate (collect all errors)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1">
                <label className="text-sm font-medium">Schema Reference (optional)</label>
                <Input
                    value={(config.schemaId as string) || ''}
                    onChange={(e) => onChange({ ...config, schemaId: e.target.value || undefined })}
                    placeholder="schema-code"
                />
                <p className="text-xs text-muted-foreground">
                    Reference a schema defined in DataHub for validation
                </p>
            </div>
        </div>
    );
}

// THROUGHPUT SETTINGS

interface ThroughputSettingsProps {
    readonly async?: boolean;
    readonly throughput?: { batchSize?: number; rateLimitRps?: number };
    readonly onChange: (async: boolean | undefined, throughput: { batchSize?: number; rateLimitRps?: number } | undefined) => void;
}

function ThroughputSettings({ async, throughput, onChange }: ThroughputSettingsProps) {
    const [expanded, setExpanded] = React.useState(false);

    return (
        <div className="border-t pt-3">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
                <span>{expanded ? '▼' : '▶'}</span>
                <span>Advanced Settings</span>
            </button>

            {expanded && (
                <div className="mt-3 space-y-3 pl-4">
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={Boolean(async)}
                            onCheckedChange={(v) => onChange(v || undefined, throughput)}
                        />
                        <label className="text-sm">Run asynchronously (background job)</label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm text-muted-foreground">Batch Size</label>
                            <Input
                                type="number"
                                value={throughput?.batchSize ?? ''}
                                onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : undefined;
                                    onChange(async, { ...throughput, batchSize: val });
                                }}
                                placeholder="50"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm text-muted-foreground">Rate Limit (req/s)</label>
                            <Input
                                type="number"
                                value={throughput?.rateLimitRps ?? ''}
                                onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : undefined;
                                    onChange(async, { ...throughput, rateLimitRps: val });
                                }}
                                placeholder="10"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// HELPERS (using centralized utilities from utils/step-helpers.ts)

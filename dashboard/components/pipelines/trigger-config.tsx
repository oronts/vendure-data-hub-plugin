import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Badge,
    ScrollArea,
    Separator,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Textarea,
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@vendure/dashboard';
import {
    Clock,
    Webhook,
    Zap,
    Play,
    Plus,
    Trash2,
    Settings,
    Calendar,
    Bell,
    Mail,
    AlertTriangle,
    AlertCircle,
    CheckCircle,
    X,
    Copy,
    Eye,
    EyeOff,
    RefreshCw,
    ArrowRight,
    Filter,
    Code,
    Box,
    ShoppingCart,
    User,
    Package,
    CreditCard,
    FileText,
    Globe,
    Lock,
    Key,
    HelpCircle,
    Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { validateCron, validateCode, CODE_PATTERN } from '../../utils/form-validation';
import { FieldError } from '../common/validation-feedback';

// TYPES

export type TriggerType = 'schedule' | 'webhook' | 'event' | 'manual';

export interface ScheduleTrigger {
    type: 'schedule';
    cron: string;
    timezone: string;
    enabled: boolean;
}

export interface WebhookTrigger {
    type: 'webhook';
    webhookPath: string;
    method: 'GET' | 'POST' | 'PUT';
    secret?: string;
    validatePayload: boolean;
    enabled: boolean;
}

export interface EventTrigger {
    type: 'event';
    eventType: string;
    conditions: TriggerCondition[];
    enabled: boolean;
}

export interface ManualTrigger {
    type: 'manual';
    enabled: boolean;
}

export type Trigger = ScheduleTrigger | WebhookTrigger | EventTrigger | ManualTrigger;

export interface TriggerCondition {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'notIn' | 'isNull' | 'isNotNull';
    value: string;
}

export interface TriggerConfigProps {
    triggers: Trigger[];
    onChange: (triggers: Trigger[]) => void;
    pipelineCode?: string;
}

// VENDURE EVENTS

const VENDURE_EVENTS = [
    { category: 'Order', events: [
        { code: 'OrderStateTransition', label: 'Order State Changed', description: 'When an order transitions to a new state' },
        { code: 'OrderPlaced', label: 'Order Placed', description: 'When an order is placed' },
        { code: 'OrderPaymentSettled', label: 'Payment Settled', description: 'When payment for an order is settled' },
        { code: 'OrderFulfilled', label: 'Order Fulfilled', description: 'When an order is fulfilled' },
        { code: 'OrderRefunded', label: 'Order Refunded', description: 'When an order is refunded' },
        { code: 'OrderCancelled', label: 'Order Cancelled', description: 'When an order is cancelled' },
    ]},
    { category: 'Product', events: [
        { code: 'ProductCreated', label: 'Product Created', description: 'When a new product is created' },
        { code: 'ProductUpdated', label: 'Product Updated', description: 'When a product is updated' },
        { code: 'ProductDeleted', label: 'Product Deleted', description: 'When a product is deleted' },
        { code: 'StockLevelUpdated', label: 'Stock Level Changed', description: 'When product stock changes' },
    ]},
    { category: 'Customer', events: [
        { code: 'CustomerCreated', label: 'Customer Created', description: 'When a new customer registers' },
        { code: 'CustomerUpdated', label: 'Customer Updated', description: 'When customer info is updated' },
        { code: 'CustomerAddressCreated', label: 'Address Added', description: 'When a customer adds an address' },
    ]},
    { category: 'Catalog', events: [
        { code: 'CollectionModified', label: 'Collection Modified', description: 'When a collection is modified' },
        { code: 'AssetUploaded', label: 'Asset Uploaded', description: 'When a new asset is uploaded' },
        { code: 'FacetValueCreated', label: 'Facet Value Created', description: 'When a new facet value is created' },
    ]},
];

// CRON PRESETS

const CRON_PRESETS = [
    { label: 'Every minute', cron: '* * * * *' },
    { label: 'Every 5 minutes', cron: '*/5 * * * *' },
    { label: 'Every 15 minutes', cron: '*/15 * * * *' },
    { label: 'Every hour', cron: '0 * * * *' },
    { label: 'Every 6 hours', cron: '0 */6 * * *' },
    { label: 'Every day at midnight', cron: '0 0 * * *' },
    { label: 'Every day at 6 AM', cron: '0 6 * * *' },
    { label: 'Every Monday at 9 AM', cron: '0 9 * * 1' },
    { label: 'First day of month', cron: '0 0 1 * *' },
];

const TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Los_Angeles',
    'America/Chicago',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Dubai',
    'Australia/Sydney',
];

// SCHEDULE TRIGGER CONFIG

interface ScheduleTriggerConfigProps {
    trigger: ScheduleTrigger;
    onChange: (trigger: ScheduleTrigger) => void;
    onRemove: () => void;
}

function ScheduleTriggerConfig({ trigger, onChange, onRemove }: ScheduleTriggerConfigProps) {
    const [showCustomCron, setShowCustomCron] = React.useState(
        !CRON_PRESETS.some(p => p.cron === trigger.cron)
    );
    const [cronTouched, setCronTouched] = React.useState(false);

    const getNextRuns = (cron: string): string[] => {
        // Simplified - in production use a library like cron-parser
        return ['Next run: calculated by backend'];
    };

    // Validate cron expression
    const cronError = React.useMemo(() => {
        if (!trigger.cron || trigger.cron.trim() === '') {
            return 'Schedule is required';
        }
        const error = validateCron(trigger.cron, 'Schedule');
        return error?.message ?? null;
    }, [trigger.cron]);

    return (
        <Card>
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-500" />
                        <CardTitle className="text-base">Schedule Trigger</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={trigger.enabled}
                            onCheckedChange={v => onChange({ ...trigger, enabled: v })}
                        />
                        <Button variant="ghost" size="icon" onClick={onRemove}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
                <CardDescription>Run this pipeline on a schedule</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Preset or Custom */}
                <div className="flex items-center gap-2 mb-4">
                    <Button
                        variant={!showCustomCron ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setShowCustomCron(false)}
                    >
                        Presets
                    </Button>
                    <Button
                        variant={showCustomCron ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setShowCustomCron(true)}
                    >
                        Custom Cron
                    </Button>
                </div>

                {!showCustomCron ? (
                    <div className="grid grid-cols-3 gap-2">
                        {CRON_PRESETS.map(preset => (
                            <Button
                                key={preset.cron}
                                variant={trigger.cron === preset.cron ? 'default' : 'outline'}
                                size="sm"
                                className="justify-start"
                                onClick={() => onChange({ ...trigger, cron: preset.cron })}
                            >
                                {preset.label}
                            </Button>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Label>Cron Expression *</Label>
                        <Input
                            value={trigger.cron}
                            onChange={e => onChange({ ...trigger, cron: e.target.value })}
                            onBlur={() => setCronTouched(true)}
                            placeholder="* * * * *"
                            className={`font-mono ${cronError && cronTouched ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                        />
                        <FieldError error={cronError} touched={cronTouched} />
                        {!cronError && (
                            <p className="text-xs text-muted-foreground">
                                Format: minute hour day month weekday (e.g., "0 9 * * 1-5" = 9 AM weekdays)
                            </p>
                        )}
                    </div>
                )}

                <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Select
                        value={trigger.timezone}
                        onValueChange={v => onChange({ ...trigger, timezone: v })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TIMEZONES.map(tz => (
                                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                        <Clock className="w-4 h-4 inline mr-1" />
                        {getNextRuns(trigger.cron)[0]}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

// WEBHOOK TRIGGER CONFIG

interface WebhookTriggerConfigProps {
    trigger: WebhookTrigger;
    onChange: (trigger: WebhookTrigger) => void;
    onRemove: () => void;
    baseUrl?: string;
}

function WebhookTriggerConfig({ trigger, onChange, onRemove, baseUrl = 'https://your-store.com' }: WebhookTriggerConfigProps) {
    const [showSecret, setShowSecret] = React.useState(false);
    const [pathTouched, setPathTouched] = React.useState(false);

    const webhookUrl = `${baseUrl}/data-hub/webhook/${trigger.webhookPath}`;

    // Validate path
    const pathError = React.useMemo(() => {
        if (!trigger.webhookPath || trigger.webhookPath.trim() === '') {
            return 'Webhook path is required';
        }
        if (!/^[a-z0-9][a-z0-9-_]*$/i.test(trigger.webhookPath)) {
            return 'Path must contain only letters, numbers, hyphens, and underscores';
        }
        return null;
    }, [trigger.webhookPath]);

    const copyUrl = () => {
        navigator.clipboard.writeText(webhookUrl);
        toast.success('Webhook URL copied to clipboard');
    };

    const generateSecret = () => {
        const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        onChange({ ...trigger, secret });
        toast.success('Secret generated');
    };

    return (
        <Card>
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Webhook className="w-5 h-5 text-purple-500" />
                        <CardTitle className="text-base">Webhook Trigger</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={trigger.enabled}
                            onCheckedChange={v => onChange({ ...trigger, enabled: v })}
                        />
                        <Button variant="ghost" size="icon" onClick={onRemove}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
                <CardDescription>Trigger this pipeline via HTTP webhook</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>Webhook Path *</Label>
                    <div className="flex gap-2">
                        <Input
                            value={trigger.webhookPath}
                            onChange={e => onChange({ ...trigger, webhookPath: e.target.value.replace(/[^a-z0-9-_]/gi, '') })}
                            onBlur={() => setPathTouched(true)}
                            placeholder="my-pipeline"
                            className={pathError && pathTouched ? 'border-destructive focus-visible:ring-destructive' : ''}
                        />
                        <Select
                            value={trigger.method}
                            onValueChange={v => onChange({ ...trigger, method: v as WebhookTrigger['method'] })}
                        >
                            <SelectTrigger className="w-24">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="POST">POST</SelectItem>
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="PUT">PUT</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <FieldError error={pathError} touched={pathTouched} />
                </div>

                {/* Full URL display */}
                <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                        <code className="text-sm break-all">{webhookUrl}</code>
                        <Button variant="ghost" size="icon" onClick={copyUrl}>
                            <Copy className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <Separator />

                {/* Security */}
                <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        Security
                    </h4>

                    <div className="space-y-2">
                        <Label>Webhook Secret (HMAC Signature)</Label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Input
                                    type={showSecret ? 'text' : 'password'}
                                    value={trigger.secret || ''}
                                    onChange={e => onChange({ ...trigger, secret: e.target.value })}
                                    placeholder="Optional secret for signature validation"
                                    className="pr-10 font-mono"
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full"
                                    onClick={() => setShowSecret(!showSecret)}
                                >
                                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                            </div>
                            <Button variant="outline" onClick={generateSecret}>
                                <Key className="w-4 h-4 mr-2" />
                                Generate
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            If set, requests must include X-DataHub-Signature header with HMAC-SHA256 signature
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch
                            checked={trigger.validatePayload}
                            onCheckedChange={v => onChange({ ...trigger, validatePayload: v })}
                        />
                        <Label>Validate payload against pipeline input schema</Label>
                    </div>
                </div>

                {/* Example */}
                <Accordion type="single" collapsible>
                    <AccordionItem value="example">
                        <AccordionTrigger>
                            <span className="flex items-center gap-2">
                                <Code className="w-4 h-4" />
                                Example Request
                            </span>
                        </AccordionTrigger>
                        <AccordionContent>
                            <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`curl -X ${trigger.method} \\
  '${webhookUrl}' \\
  -H 'Content-Type: application/json' \\${trigger.secret ? `
  -H 'X-DataHub-Signature: sha256=...' \\` : ''}
  -d '{
    "data": [
      { "sku": "ABC123", "name": "Product 1" }
    ]
  }'`}
                            </pre>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    );
}

// EVENT TRIGGER CONFIG

interface EventTriggerConfigProps {
    trigger: EventTrigger;
    onChange: (trigger: EventTrigger) => void;
    onRemove: () => void;
}

function EventTriggerConfig({ trigger, onChange, onRemove }: EventTriggerConfigProps) {
    const selectedEvent = VENDURE_EVENTS.flatMap(c => c.events).find(e => e.code === trigger.eventType);
    const [eventTouched, setEventTouched] = React.useState(false);

    // Validate event type
    const eventError = React.useMemo(() => {
        if (!trigger.eventType || trigger.eventType.trim() === '') {
            return 'Event type is required';
        }
        return null;
    }, [trigger.eventType]);

    const addCondition = () => {
        onChange({
            ...trigger,
            conditions: [...trigger.conditions, { field: '', operator: 'eq', value: '' }],
        });
    };

    const updateCondition = (idx: number, updates: Partial<TriggerCondition>) => {
        const newConditions = [...trigger.conditions];
        newConditions[idx] = { ...newConditions[idx], ...updates };
        onChange({ ...trigger, conditions: newConditions });
    };

    const removeCondition = (idx: number) => {
        onChange({ ...trigger, conditions: trigger.conditions.filter((_, i) => i !== idx) });
    };

    const getEventIcon = (category: string) => {
        switch (category) {
            case 'Order': return ShoppingCart;
            case 'Product': return Package;
            case 'Customer': return User;
            case 'Catalog': return FileText;
            default: return Zap;
        }
    };

    return (
        <Card>
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-yellow-500" />
                        <CardTitle className="text-base">Event Trigger</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={trigger.enabled}
                            onCheckedChange={v => onChange({ ...trigger, enabled: v })}
                        />
                        <Button variant="ghost" size="icon" onClick={onRemove}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
                <CardDescription>Trigger when a Vendure event occurs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Event Selection */}
                <div className="space-y-2">
                    <Label>Event Type *</Label>
                    <Select
                        value={trigger.eventType}
                        onValueChange={v => {
                            onChange({ ...trigger, eventType: v });
                            setEventTouched(true);
                        }}
                    >
                        <SelectTrigger className={eventError && eventTouched ? 'border-destructive focus-visible:ring-destructive' : ''}>
                            <SelectValue placeholder="Select event type" />
                        </SelectTrigger>
                        <SelectContent>
                            {VENDURE_EVENTS.map(category => {
                                const Icon = getEventIcon(category.category);
                                return (
                                    <React.Fragment key={category.category}>
                                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-2">
                                            <Icon className="w-3 h-3" />
                                            {category.category}
                                        </div>
                                        {category.events.map(event => (
                                            <SelectItem key={event.code} value={event.code}>
                                                <div>
                                                    <div>{event.label}</div>
                                                    <div className="text-xs text-muted-foreground">{event.description}</div>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                        </SelectContent>
                    </Select>
                    <FieldError error={eventError} touched={eventTouched} />
                </div>

                {selectedEvent && (
                    <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm">
                            <Info className="w-4 h-4 inline mr-1" />
                            {selectedEvent.description}
                        </p>
                    </div>
                )}

                <Separator />

                {/* Conditions */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-medium flex items-center gap-2">
                            <Filter className="w-4 h-4" />
                            Conditions (optional)
                        </h4>
                        <Button variant="outline" size="sm" onClick={addCondition}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Condition
                        </Button>
                    </div>

                    {trigger.conditions.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No conditions - pipeline will run for all events of this type
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {trigger.conditions.map((cond, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    {idx > 0 && (
                                        <Badge variant="outline" className="w-12 justify-center">AND</Badge>
                                    )}
                                    <Input
                                        value={cond.field}
                                        onChange={e => updateCondition(idx, { field: e.target.value })}
                                        placeholder="event.order.state"
                                        className="flex-1"
                                    />
                                    <Select
                                        value={cond.operator}
                                        onValueChange={v => updateCondition(idx, { operator: v as TriggerCondition['operator'] })}
                                    >
                                        <SelectTrigger className="w-32">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="eq">equals</SelectItem>
                                            <SelectItem value="neq">not equals</SelectItem>
                                            <SelectItem value="gt">greater than</SelectItem>
                                            <SelectItem value="gte">greater or equal</SelectItem>
                                            <SelectItem value="lt">less than</SelectItem>
                                            <SelectItem value="lte">less or equal</SelectItem>
                                            <SelectItem value="contains">contains</SelectItem>
                                            <SelectItem value="in">in array</SelectItem>
                                            <SelectItem value="notIn">not in array</SelectItem>
                                            <SelectItem value="isNull">is null</SelectItem>
                                            <SelectItem value="isNotNull">is not null</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={cond.value}
                                        onChange={e => updateCondition(idx, { value: e.target.value })}
                                        placeholder="PaymentSettled"
                                        className="flex-1"
                                    />
                                    <Button variant="ghost" size="icon" onClick={() => removeCondition(idx)}>
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                        Use dot notation to access nested properties (e.g., "event.order.total", "event.product.name")
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

// MANUAL TRIGGER CONFIG

interface ManualTriggerConfigProps {
    trigger: ManualTrigger;
    onChange: (trigger: ManualTrigger) => void;
    onRemove: () => void;
}

function ManualTriggerConfig({ trigger, onChange, onRemove }: ManualTriggerConfigProps) {
    return (
        <Card>
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Play className="w-5 h-5 text-green-500" />
                        <CardTitle className="text-base">Manual Trigger</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={trigger.enabled}
                            onCheckedChange={v => onChange({ ...trigger, enabled: v })}
                        />
                        <Button variant="ghost" size="icon" onClick={onRemove}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
                <CardDescription>Allow manual pipeline execution from the dashboard</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="p-4 bg-muted rounded-lg text-center">
                    <Play className="w-8 h-8 mx-auto mb-2 text-green-500" />
                    <p className="text-sm">
                        Users with appropriate permissions can manually start this pipeline
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

// MAIN COMPONENT

export function TriggerConfig({ triggers, onChange, pipelineCode }: TriggerConfigProps) {
    const addTrigger = (type: TriggerType) => {
        let newTrigger: Trigger;

        switch (type) {
            case 'schedule':
                newTrigger = {
                    type: 'schedule',
                    cron: '0 * * * *',
                    timezone: 'UTC',
                    enabled: true,
                };
                break;
            case 'webhook':
                newTrigger = {
                    type: 'webhook',
                    webhookPath: pipelineCode || `webhook-${Date.now()}`,
                    method: 'POST',
                    validatePayload: false,
                    enabled: true,
                };
                break;
            case 'event':
                newTrigger = {
                    type: 'event',
                    eventType: '',
                    conditions: [],
                    enabled: true,
                };
                break;
            case 'manual':
            default:
                newTrigger = {
                    type: 'manual',
                    enabled: true,
                };
                break;
        }

        onChange([...triggers, newTrigger]);
    };

    const updateTrigger = (index: number, trigger: Trigger) => {
        const newTriggers = [...triggers];
        newTriggers[index] = trigger;
        onChange(newTriggers);
    };

    const removeTrigger = (index: number) => {
        onChange(triggers.filter((_, i) => i !== index));
    };

    const hasTriggerType = (type: TriggerType) => triggers.some(t => t.type === type);

    return (
        <div className="space-y-6">
            {/* Add Trigger Buttons */}
            <div className="flex flex-wrap gap-2">
                <Button
                    variant="outline"
                    onClick={() => addTrigger('schedule')}
                    disabled={hasTriggerType('schedule')}
                >
                    <Clock className="w-4 h-4 mr-2" />
                    Add Schedule
                </Button>
                <Button
                    variant="outline"
                    onClick={() => addTrigger('webhook')}
                    disabled={hasTriggerType('webhook')}
                >
                    <Webhook className="w-4 h-4 mr-2" />
                    Add Webhook
                </Button>
                <Button
                    variant="outline"
                    onClick={() => addTrigger('event')}
                >
                    <Zap className="w-4 h-4 mr-2" />
                    Add Event Trigger
                </Button>
                <Button
                    variant="outline"
                    onClick={() => addTrigger('manual')}
                    disabled={hasTriggerType('manual')}
                >
                    <Play className="w-4 h-4 mr-2" />
                    Add Manual
                </Button>
            </div>

            {/* Trigger List */}
            {triggers.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-lg font-medium mb-2">No Triggers Configured</p>
                        <p className="text-sm text-muted-foreground">
                            Add a trigger to define when this pipeline should run
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {triggers.map((trigger, index) => {
                        switch (trigger.type) {
                            case 'schedule':
                                return (
                                    <ScheduleTriggerConfig
                                        key={index}
                                        trigger={trigger}
                                        onChange={t => updateTrigger(index, t)}
                                        onRemove={() => removeTrigger(index)}
                                    />
                                );
                            case 'webhook':
                                return (
                                    <WebhookTriggerConfig
                                        key={index}
                                        trigger={trigger}
                                        onChange={t => updateTrigger(index, t)}
                                        onRemove={() => removeTrigger(index)}
                                    />
                                );
                            case 'event':
                                return (
                                    <EventTriggerConfig
                                        key={index}
                                        trigger={trigger}
                                        onChange={t => updateTrigger(index, t)}
                                        onRemove={() => removeTrigger(index)}
                                    />
                                );
                            case 'manual':
                                return (
                                    <ManualTriggerConfig
                                        key={index}
                                        trigger={trigger}
                                        onChange={t => updateTrigger(index, t)}
                                        onRemove={() => removeTrigger(index)}
                                    />
                                );
                        }
                    })}
                </div>
            )}

            {/* Summary */}
            {triggers.length > 0 && (
                <Card>
                    <CardHeader className="py-3">
                        <CardTitle className="text-sm">Trigger Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="py-3">
                        <div className="flex flex-wrap gap-2">
                            {triggers.map((trigger, idx) => {
                                const getLabel = () => {
                                    switch (trigger.type) {
                                        case 'schedule': return `Schedule: ${trigger.cron}`;
                                        case 'webhook': return `Webhook: /${trigger.webhookPath}`;
                                        case 'event': return `Event: ${trigger.eventType || 'Not selected'}`;
                                        case 'manual': return 'Manual';
                                    }
                                };

                                return (
                                    <Badge
                                        key={idx}
                                        variant={trigger.enabled ? 'default' : 'secondary'}
                                    >
                                        {!trigger.enabled && <EyeOff className="w-3 h-3 mr-1" />}
                                        {getLabel()}
                                    </Badge>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

export default TriggerConfig;

import * as React from 'react';
import { useCallback } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Label,
    Input,
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Button,
    Badge,
} from '@vendure/dashboard';
import { Trash2, Calendar } from 'lucide-react';
import type { PipelineTrigger, TriggerType, WebhookAuthType, TriggerFormProps } from '../../../types';
import {
    CRON_PRESETS,
    WEBHOOK_AUTH_TYPES,
    TRIGGER_ICONS,
    TRIGGER_TYPE_CONFIGS,
    TRIGGER_TYPES,
    QUEUE_TYPES,
    QUEUE_TYPE_CONFIGS,
    ACK_MODES,
    ACK_MODE_VALUES,
    VENDURE_EVENTS_BY_CATEGORY,
    UI_STRINGS,
    SELECT_WIDTHS,
} from '../../../constants';

export function TriggerForm({
    trigger,
    onChange,
    onRemove,
    readOnly = false,
    secretCodes = [],
    compact = false,
}: TriggerFormProps) {
    const handleChange = useCallback(<K extends keyof PipelineTrigger>(
        key: K,
        value: PipelineTrigger[K]
    ) => {
        onChange({ ...trigger, [key]: value });
    }, [trigger, onChange]);

    const TriggerIcon = TRIGGER_ICONS[trigger.type];

    const formContent = (
        <>
            {!compact && (
                <div className="flex items-center justify-between">
                    <Label htmlFor="trigger-enabled">Enabled</Label>
                    <Switch
                        id="trigger-enabled"
                        checked={trigger.enabled !== false}
                        onCheckedChange={(checked) => handleChange('enabled', checked)}
                        disabled={readOnly}
                    />
                </div>
            )}

            <div className="space-y-2" data-testid="datahub-triggerform-field-type">
                <Label>Trigger Type</Label>
                <Select
                    value={trigger.type}
                    onValueChange={(v) => handleChange('type', v as TriggerType)}
                    disabled={readOnly}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.values(TRIGGER_TYPE_CONFIGS).map((config) => {
                            const Icon = TRIGGER_ICONS[config.type];
                            return (
                                <SelectItem key={config.type} value={config.type}>
                                    <span className="flex items-center gap-2">
                                        <Icon className="h-4 w-4" />
                                        {config.label}
                                    </span>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            </div>

            {trigger.type === TRIGGER_TYPES.SCHEDULE && (
                <div className="space-y-4 border-t pt-4" data-testid="datahub-triggerform-field-schedule">
                    <div className="space-y-2">
                        <Label>Cron Expression</Label>
                        <div className="flex gap-2">
                            <Input
                                value={trigger.cron || ''}
                                onChange={(e) => handleChange('cron', e.target.value)}
                                placeholder="* * * * *"
                                disabled={readOnly}
                                className="font-mono"
                            />
                            <Select
                                value=""
                                onValueChange={(v) => handleChange('cron', v)}
                                disabled={readOnly}
                            >
                                <SelectTrigger className={SELECT_WIDTHS.TRIGGER_TYPE}>
                                    <Calendar className="h-4 w-4 mr-2" />
                                    <span>Presets</span>
                                </SelectTrigger>
                                <SelectContent>
                                    {CRON_PRESETS.map((p) => (
                                        <SelectItem key={p.cron} value={p.cron}>
                                            {p.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {UI_STRINGS.CRON_FORMAT_HINT}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Timezone</Label>
                        <Input
                            value={trigger.timezone || ''}
                            onChange={(e) => handleChange('timezone', e.target.value)}
                            placeholder="UTC (default)"
                            disabled={readOnly}
                        />
                    </div>
                </div>
            )}

            {trigger.type === TRIGGER_TYPES.WEBHOOK && (
                <div className="space-y-4 border-t pt-4" data-testid="datahub-triggerform-field-webhook">
                    <div className="space-y-2">
                        <Label>Webhook Code</Label>
                        <Input
                            value={trigger.webhookCode || ''}
                            onChange={(e) => handleChange('webhookCode', e.target.value)}
                            placeholder="my-webhook"
                            disabled={readOnly}
                        />
                        <p className="text-xs text-muted-foreground">
                            Endpoint: /data-hub/webhook/{trigger.webhookCode || '{code}'}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Authentication</Label>
                        <Select
                            value={trigger.authentication || 'NONE'}
                            onValueChange={(v) => handleChange('authentication', v as WebhookAuthType)}
                            disabled={readOnly}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {WEBHOOK_AUTH_TYPES.map((a) => (
                                    <SelectItem key={a.value} value={a.value}>
                                        {a.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {trigger.authentication && trigger.authentication !== 'NONE' && (
                        <div className="space-y-2">
                            <Label>Secret</Label>
                            <Select
                                value={trigger.secretCode || ''}
                                onValueChange={(v) => handleChange('secretCode', v)}
                                disabled={readOnly}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={UI_STRINGS.PLACEHOLDER_SELECT_SECRET} />
                                </SelectTrigger>
                                <SelectContent>
                                    {secretCodes.map((code) => (
                                        <SelectItem key={code} value={code}>
                                            {code}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            )}

            {trigger.type === TRIGGER_TYPES.EVENT && (
                <div className="space-y-4 border-t pt-4" data-testid="datahub-triggerform-field-event">
                    <div className="space-y-2">
                        <Label>Event Type</Label>
                        <Select
                            value={trigger.eventType || ''}
                            onValueChange={(v) => handleChange('eventType', v)}
                            disabled={readOnly}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={UI_STRINGS.PLACEHOLDER_SELECT_EVENT} />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(VENDURE_EVENTS_BY_CATEGORY).map(([category, events]) => (
                                    <React.Fragment key={category}>
                                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                                            {category}
                                        </div>
                                        {events.map((event) => (
                                            <SelectItem key={event.event} value={event.event}>
                                                {event.label}
                                            </SelectItem>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {trigger.type === TRIGGER_TYPES.FILE && (
                <div className="space-y-4 border-t pt-4" data-testid="datahub-triggerform-field-file">
                    <div className="space-y-2">
                        <Label>Connection Code</Label>
                        <Input
                            value={trigger.fileWatch?.connectionCode || ''}
                            onChange={(e) => handleChange('fileWatch', {
                                ...trigger.fileWatch,
                                connectionCode: e.target.value,
                                path: trigger.fileWatch?.path || '',
                            })}
                            placeholder="my-sftp-connection"
                            disabled={readOnly}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Watch Path</Label>
                        <Input
                            value={trigger.fileWatch?.path || ''}
                            onChange={(e) => handleChange('fileWatch', {
                                ...trigger.fileWatch,
                                path: e.target.value,
                                connectionCode: trigger.fileWatch?.connectionCode || '',
                            })}
                            placeholder="/incoming/*.csv"
                            disabled={readOnly}
                        />
                        <p className="text-xs text-muted-foreground">
                            {UI_STRINGS.GLOB_PATTERN_HINT}
                        </p>
                    </div>
                </div>
            )}

            {trigger.type === TRIGGER_TYPES.MESSAGE && (
                <div className="space-y-4 border-t pt-4" data-testid="datahub-triggerform-field-message">
                    <div className="space-y-2">
                        <Label>Queue Type</Label>
                        <Select
                            value={trigger.message?.queueType || QUEUE_TYPES.RABBITMQ_AMQP}
                            onValueChange={(value) => handleChange('message', {
                                ...trigger.message,
                                queueType: value,
                                connectionCode: trigger.message?.connectionCode || '',
                                queueName: trigger.message?.queueName || '',
                            })}
                            disabled={readOnly}
                        >
                            <SelectTrigger className={SELECT_WIDTHS.MEDIUM}>
                                <SelectValue placeholder="Select queue type" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(QUEUE_TYPE_CONFIGS).map((config) => (
                                    <SelectItem key={config.type} value={config.type}>
                                        <div className="flex flex-col">
                                            <span>{config.label}</span>
                                            <span className="text-xs text-muted-foreground">{config.description}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Connection Code</Label>
                        <Input
                            value={trigger.message?.connectionCode || ''}
                            onChange={(e) => handleChange('message', {
                                ...trigger.message,
                                connectionCode: e.target.value,
                                queueName: trigger.message?.queueName || '',
                                queueType: trigger.message?.queueType || QUEUE_TYPES.RABBITMQ_AMQP,
                            })}
                            placeholder="my-queue-connection"
                            disabled={readOnly}
                        />
                        <p className="text-xs text-muted-foreground">
                            Reference to a connection with queue credentials
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>Queue Name</Label>
                        <Input
                            value={trigger.message?.queueName || ''}
                            onChange={(e) => handleChange('message', {
                                ...trigger.message,
                                queueName: e.target.value,
                                connectionCode: trigger.message?.connectionCode || '',
                                queueType: trigger.message?.queueType || QUEUE_TYPES.RABBITMQ_AMQP,
                            })}
                            placeholder="my-queue"
                            disabled={readOnly}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Batch Size</Label>
                            <Input
                                type="number"
                                value={trigger.message?.batchSize || 10}
                                onChange={(e) => handleChange('message', {
                                    ...trigger.message,
                                    batchSize: parseInt(e.target.value, 10) || 10,
                                    connectionCode: trigger.message?.connectionCode || '',
                                    queueName: trigger.message?.queueName || '',
                                    queueType: trigger.message?.queueType || QUEUE_TYPES.RABBITMQ_AMQP,
                                })}
                                min={1}
                                max={100}
                                disabled={readOnly}
                            />
                            <p className="text-xs text-muted-foreground">
                                Messages per poll (1-100)
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Ack Mode</Label>
                            <Select
                                value={trigger.message?.ackMode || ACK_MODE_VALUES.MANUAL}
                                onValueChange={(value) => handleChange('message', {
                                    ...trigger.message,
                                    ackMode: value,
                                    connectionCode: trigger.message?.connectionCode || '',
                                    queueName: trigger.message?.queueName || '',
                                    queueType: trigger.message?.queueType || QUEUE_TYPES.RABBITMQ_AMQP,
                                })}
                                disabled={readOnly}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select ack mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(ACK_MODES).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Consumer Group (Optional)</Label>
                        <Input
                            value={trigger.message?.consumerGroup || ''}
                            onChange={(e) => handleChange('message', {
                                ...trigger.message,
                                consumerGroup: e.target.value || undefined,
                                connectionCode: trigger.message?.connectionCode || '',
                                queueName: trigger.message?.queueName || '',
                                queueType: trigger.message?.queueType || QUEUE_TYPES.RABBITMQ_AMQP,
                            })}
                            placeholder="datahub-consumers"
                            disabled={readOnly}
                        />
                        <p className="text-xs text-muted-foreground">
                            Consumer group for Redis Streams or Kafka
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>Dead Letter Queue (Optional)</Label>
                        <Input
                            value={trigger.message?.deadLetterQueue || ''}
                            onChange={(e) => handleChange('message', {
                                ...trigger.message,
                                deadLetterQueue: e.target.value || undefined,
                                connectionCode: trigger.message?.connectionCode || '',
                                queueName: trigger.message?.queueName || '',
                                queueType: trigger.message?.queueType || QUEUE_TYPES.RABBITMQ_AMQP,
                            })}
                            placeholder="my-queue-dlq"
                            disabled={readOnly}
                        />
                        <p className="text-xs text-muted-foreground">
                            Failed messages are routed here
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={trigger.message?.autoStart !== false}
                            onCheckedChange={(checked) => handleChange('message', {
                                ...trigger.message,
                                autoStart: checked,
                                connectionCode: trigger.message?.connectionCode || '',
                                queueName: trigger.message?.queueName || '',
                                queueType: trigger.message?.queueType || QUEUE_TYPES.RABBITMQ_AMQP,
                            })}
                            disabled={readOnly}
                        />
                        <Label>Auto-start consumer on startup</Label>
                    </div>
                </div>
            )}
        </>
    );

    if (compact) {
        return <div className="space-y-4" data-testid="datahub-triggerform-form">{formContent}</div>;
    }

    return (
        <Card data-testid="datahub-triggerform-form">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <TriggerIcon className="h-4 w-4" />
                        Trigger Configuration
                        {trigger.enabled !== false && (
                            <Badge variant="secondary" className="text-xs">
                                Active
                            </Badge>
                        )}
                    </CardTitle>
                    {onRemove && !readOnly && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onRemove}
                            className="text-destructive hover:text-destructive"
                            aria-label="Remove trigger"
                            data-testid="datahub-trigger-remove-btn"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {formContent}
            </CardContent>
        </Card>
    );
}

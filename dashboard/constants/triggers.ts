import type { TriggerType, QueueTypeValue, AckMode } from '../../shared/types';
import { TRIGGER_TYPES } from '../../shared/types';
import {
    Play,
    Clock,
    Webhook,
    Zap,
    Eye,
    MessageSquare,
    type LucideIcon,
} from 'lucide-react';

export type { TriggerType };
export { TRIGGER_TYPES };

export const TRIGGER_ICONS: Record<TriggerType, LucideIcon> = {
    [TRIGGER_TYPES.MANUAL]: Play,
    [TRIGGER_TYPES.SCHEDULE]: Clock,
    [TRIGGER_TYPES.WEBHOOK]: Webhook,
    [TRIGGER_TYPES.EVENT]: Zap,
    [TRIGGER_TYPES.FILE]: Eye,
    [TRIGGER_TYPES.MESSAGE]: MessageSquare,
};

export interface TriggerTypeConfig {
    readonly type: TriggerType;
    readonly label: string;
    readonly description: string;
    readonly icon: string;
}

export const TRIGGER_TYPE_CONFIGS: Record<TriggerType, TriggerTypeConfig> = {
    [TRIGGER_TYPES.MANUAL]: {
        type: TRIGGER_TYPES.MANUAL,
        label: 'Manual',
        description: 'Start pipeline manually from the dashboard',
        icon: 'MousePointerClick',
    },
    [TRIGGER_TYPES.SCHEDULE]: {
        type: TRIGGER_TYPES.SCHEDULE,
        label: 'Schedule',
        description: 'Run pipeline on a schedule (cron)',
        icon: 'Clock',
    },
    [TRIGGER_TYPES.WEBHOOK]: {
        type: TRIGGER_TYPES.WEBHOOK,
        label: 'Webhook',
        description: 'Trigger via HTTP webhook',
        icon: 'Webhook',
    },
    [TRIGGER_TYPES.EVENT]: {
        type: TRIGGER_TYPES.EVENT,
        label: 'Event',
        description: 'React to Vendure events',
        icon: 'Zap',
    },
    [TRIGGER_TYPES.FILE]: {
        type: TRIGGER_TYPES.FILE,
        label: 'File Watch',
        description: 'Trigger when files appear in S3/SFTP/local folder',
        icon: 'FolderOpen',
    },
    [TRIGGER_TYPES.MESSAGE]: {
        type: TRIGGER_TYPES.MESSAGE,
        label: 'Message Queue',
        description: 'Consume messages from RabbitMQ, SQS, or Redis Streams',
        icon: 'MessageSquare',
    },
};

export interface CronPreset {
    readonly label: string;
    readonly cron: string;
    readonly description: string;
}

export const CRON_PRESETS: readonly CronPreset[] = [
    { label: 'Every minute', cron: '* * * * *', description: 'Runs every minute' },
    { label: 'Every 5 minutes', cron: '*/5 * * * *', description: 'Runs every 5 minutes' },
    { label: 'Every 15 minutes', cron: '*/15 * * * *', description: 'Runs every 15 minutes' },
    { label: 'Every 30 minutes', cron: '*/30 * * * *', description: 'Runs every 30 minutes' },
    { label: 'Every hour', cron: '0 * * * *', description: 'Runs at the start of every hour' },
    { label: 'Every 2 hours', cron: '0 */2 * * *', description: 'Runs every 2 hours' },
    { label: 'Every 6 hours', cron: '0 */6 * * *', description: 'Runs every 6 hours' },
    { label: 'Daily at midnight', cron: '0 0 * * *', description: 'Runs daily at 00:00' },
    { label: 'Daily at 6 AM', cron: '0 6 * * *', description: 'Runs daily at 06:00' },
    { label: 'Daily at noon', cron: '0 12 * * *', description: 'Runs daily at 12:00' },
    { label: 'Weekly on Monday', cron: '0 0 * * 1', description: 'Runs every Monday at midnight' },
    { label: 'Monthly on 1st', cron: '0 0 1 * *', description: 'Runs on the 1st of each month' },
] as const;

export type { QueueTypeValue as QueueType };

export interface QueueTypeConfig {
    readonly type: QueueTypeValue;
    readonly label: string;
    readonly description: string;
}

export const QUEUE_TYPES = {
    RABBITMQ_AMQP: 'RABBITMQ_AMQP',
    RABBITMQ: 'RABBITMQ',
    SQS: 'SQS',
    REDIS_STREAMS: 'REDIS_STREAMS',
    INTERNAL: 'INTERNAL',
} as const;

export const QUEUE_TYPE_CONFIGS: Record<string, QueueTypeConfig> = {
    [QUEUE_TYPES.RABBITMQ_AMQP]: {
        type: QUEUE_TYPES.RABBITMQ_AMQP,
        label: 'RabbitMQ (AMQP)',
        description: 'Native AMQP 0-9-1 protocol (recommended for production)',
    },
    [QUEUE_TYPES.RABBITMQ]: {
        type: QUEUE_TYPES.RABBITMQ,
        label: 'RabbitMQ (HTTP API)',
        description: 'Message broker via HTTP Management API (port 15672)',
    },
    [QUEUE_TYPES.SQS]: {
        type: QUEUE_TYPES.SQS,
        label: 'Amazon SQS',
        description: 'AWS Simple Queue Service for cloud-native deployments',
    },
    [QUEUE_TYPES.REDIS_STREAMS]: {
        type: QUEUE_TYPES.REDIS_STREAMS,
        label: 'Redis Streams',
        description: 'High-performance messaging with consumer groups',
    },
    [QUEUE_TYPES.INTERNAL]: {
        type: QUEUE_TYPES.INTERNAL,
        label: 'Internal Queue',
        description: 'Internal BullMQ queue',
    },
};

export type { AckMode };

export const ACK_MODE_VALUES = {
    AUTO: 'AUTO',
    MANUAL: 'MANUAL',
} as const;

export const ACK_MODES: Record<AckMode, string> = {
    [ACK_MODE_VALUES.AUTO]: 'Auto',
    [ACK_MODE_VALUES.MANUAL]: 'Manual',
};

export interface WebhookAuthOption {
    readonly value: string;
    readonly label: string;
}

export const WEBHOOK_AUTH_TYPES: readonly WebhookAuthOption[] = [
    { value: 'NONE', label: 'None' },
    { value: 'BASIC', label: 'Basic Auth' },
    { value: 'BEARER', label: 'Bearer Token' },
    { value: 'API_KEY', label: 'API Key' },
    { value: 'OAUTH2', label: 'OAuth 2.0' },
    { value: 'HMAC', label: 'HMAC Signature' },
    { value: 'JWT', label: 'JWT Bearer' },
] as const;

export interface WizardTriggerOption {
    readonly id: string;
    readonly label: string;
    readonly icon: 'Play' | 'Clock' | 'Webhook' | 'Zap' | 'Eye';
    readonly desc: string;
}

export const IMPORT_WIZARD_TRIGGERS: readonly WizardTriggerOption[] = [
    { id: TRIGGER_TYPES.MANUAL, label: 'Manual', icon: 'Play', desc: 'Run manually from dashboard' },
    { id: TRIGGER_TYPES.SCHEDULE, label: 'Scheduled', icon: 'Clock', desc: 'Run on a schedule (cron)' },
    { id: TRIGGER_TYPES.WEBHOOK, label: 'Webhook', icon: 'Webhook', desc: 'Trigger via HTTP webhook' },
    { id: TRIGGER_TYPES.FILE, label: 'File Watch', icon: 'Eye', desc: 'Watch for new files' },
] as const;

export const EXPORT_WIZARD_TRIGGERS: readonly WizardTriggerOption[] = [
    { id: TRIGGER_TYPES.MANUAL, label: 'Manual', icon: 'Play', desc: 'Run manually from dashboard' },
    { id: TRIGGER_TYPES.SCHEDULE, label: 'Scheduled', icon: 'Clock', desc: 'Run on a schedule (cron)' },
    { id: TRIGGER_TYPES.EVENT, label: 'On Event', icon: 'Zap', desc: 'Trigger on Vendure events' },
    { id: TRIGGER_TYPES.WEBHOOK, label: 'Webhook', icon: 'Webhook', desc: 'Trigger via HTTP webhook' },
] as const;

export const TIMEZONES: readonly string[] = [
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
] as const;

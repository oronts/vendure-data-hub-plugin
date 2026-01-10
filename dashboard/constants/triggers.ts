/**
 * Trigger Types and Configuration
 * Pipeline trigger type definitions
 */

// Trigger type constants
export const TRIGGER_TYPES = {
    MANUAL: 'manual',
    SCHEDULE: 'schedule',
    WEBHOOK: 'webhook',
    EVENT: 'event',
} as const;

export type TriggerType = typeof TRIGGER_TYPES[keyof typeof TRIGGER_TYPES];

// Trigger type configuration interface
export interface TriggerTypeConfig {
    readonly type: TriggerType;
    readonly label: string;
    readonly description: string;
    readonly icon: string;
}

// Trigger type configuration mapping
export const TRIGGER_TYPE_CONFIGS: Record<TriggerType, TriggerTypeConfig> = {
    manual: {
        type: 'manual',
        label: 'Manual',
        description: 'Start pipeline manually from the dashboard',
        icon: 'MousePointerClick',
    },
    schedule: {
        type: 'schedule',
        label: 'Schedule',
        description: 'Run pipeline on a schedule (cron)',
        icon: 'Clock',
    },
    webhook: {
        type: 'webhook',
        label: 'Webhook',
        description: 'Trigger via HTTP webhook',
        icon: 'Webhook',
    },
    event: {
        type: 'event',
        label: 'Event',
        description: 'React to Vendure events',
        icon: 'Zap',
    },
};

// Common cron preset interface
export interface CronPreset {
    readonly label: string;
    readonly cron: string;
    readonly description: string;
}

// Common cron presets for schedule triggers
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

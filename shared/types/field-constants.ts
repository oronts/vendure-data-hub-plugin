/**
 * Shared Trigger Types
 *
 * Trigger types - consistent across UI and backend.
 */

/**
 * Trigger types - consistent across UI and backend
 */
export const TRIGGER_TYPES = {
    MANUAL: 'MANUAL',
    SCHEDULE: 'SCHEDULE',
    WEBHOOK: 'WEBHOOK',
    EVENT: 'EVENT',
    FILE: 'FILE',
    MESSAGE: 'MESSAGE',
} as const;

export type TriggerTypeValue = typeof TRIGGER_TYPES[keyof typeof TRIGGER_TYPES];

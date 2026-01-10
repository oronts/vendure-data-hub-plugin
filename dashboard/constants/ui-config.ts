/**
 * UI Configuration Constants
 * Centralized configuration values for the DataHub dashboard UI
 */

// Success rate thresholds for analytics
export const ANALYTICS_THRESHOLDS = {
    SUCCESS_RATE_GOOD: 95,
    SUCCESS_RATE_WARNING: 80,
} as const;

// Polling intervals (milliseconds)
export const POLLING_INTERVALS = {
    QUEUES: 5000,
    PIPELINE_RUNS: 5000,
    PIPELINE_RUN_DETAILS: 3000,
    RUN_ERRORS: 5000,
    ANALYTICS: 10000,
    LOGS: 30000,
    LIVE_LOGS: 3000,
    ERROR_AUDITS: 10000,
    DEFAULT: 5000,
} as const;

// UI display limits
export const UI_LIMITS = {
    MAX_PREVIEW_ROWS: 100,
    MAX_LOG_ENTRIES: 1000,
    TRUNCATE_LENGTH: 50,
} as const;

// Confidence score thresholds (0-100 scale)
export const CONFIDENCE_THRESHOLDS = {
    HIGH: 70,
    MEDIUM: 40,
} as const;

// Pipeline status to badge variant mapping
export const PIPELINE_STATUS_VARIANTS = {
    PUBLISHED: 'default',
    REVIEW: 'outline',
    DRAFT: 'secondary',
} as const;

export type PipelineStatus = keyof typeof PIPELINE_STATUS_VARIANTS;
export type BadgeVariant = typeof PIPELINE_STATUS_VARIANTS[PipelineStatus];

/**
 * Get confidence level from numeric score
 * Replaces ternary chains like: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
 */
export function scoreToConfidence(score: number): 'high' | 'medium' | 'low' {
    if (score >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
    if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
    return 'low';
}

/**
 * Get badge variant from pipeline status
 * Replaces ternary chains for status badge variants
 */
export function getStatusBadgeVariant(status: string): BadgeVariant {
    return PIPELINE_STATUS_VARIANTS[status as PipelineStatus] ?? 'secondary';
}

/**
 * Get variant based on success rate thresholds
 * Replaces: rate >= GOOD ? 'success' : rate >= WARNING ? 'warning' : 'danger'
 */
export function getSuccessRateVariant(rate: number): 'success' | 'warning' | 'danger' {
    if (rate >= ANALYTICS_THRESHOLDS.SUCCESS_RATE_GOOD) return 'success';
    if (rate >= ANALYTICS_THRESHOLDS.SUCCESS_RATE_WARNING) return 'warning';
    return 'danger';
}

/**
 * Get trend direction based on success rate
 */
export function getSuccessRateTrend(rate: number): 'up' | 'down' {
    return rate >= ANALYTICS_THRESHOLDS.SUCCESS_RATE_GOOD ? 'up' : 'down';
}

// Operator input placeholder mapping
export const OPERATOR_PLACEHOLDERS: Record<string, string> = {
    in: 'JSON array, e.g. ["A","B"]',
    regex: 'regex pattern',
    default: 'value',
} as const;

/**
 * Get placeholder text for operator input
 */
export function getOperatorPlaceholder(operator: string): string {
    return OPERATOR_PLACEHOLDERS[operator.toLowerCase()] ?? OPERATOR_PLACEHOLDERS.default;
}

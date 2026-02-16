import type { CustomFeedGenerator } from '../feeds/generators/feed-types';
import type {
    RuntimeLimitsConfig,
    CodeFirstPipeline,
    CodeFirstSecret,
    CodeFirstConnection,
} from '../../shared/types';
import type { UrlSecurityConfig } from '../utils/url-security.utils';
import type { CodeSecurityConfig } from '../utils/code-security.utils';

export type {
    BatchConfig,
    HttpConfig,
    CircuitBreakerConfig,
    ConnectionPoolConfig,
    RuntimePaginationConfig,
    SchedulerConfig,
    EventTriggerServiceConfig,
    RuntimeLimitsConfig,
    CodeFirstPipeline,
    CodeFirstSecret,
    CodeFirstConnection,
} from '../../shared/types';

export type { UrlSecurityConfig } from '../utils/url-security.utils';
export type { CodeSecurityConfig } from '../utils/code-security.utils';

/**
 * Script operator security configuration
 */
export interface ScriptSecurityConfig {
    /**
     * Whether script operators are enabled
     * Set to false for high-security environments where user code execution is not allowed
     * @default true
     */
    enabled?: boolean;

    /**
     * Code validation settings
     * Controls expression length limits, complexity limits, and allowed patterns
     */
    validation?: Partial<CodeSecurityConfig>;

    /**
     * Maximum number of cached compiled expressions
     * @default 1000
     */
    maxCacheSize?: number;

    /**
     * Default timeout for script execution in milliseconds
     * @default 5000
     */
    defaultTimeoutMs?: number;

    /**
     * Whether to enable expression caching
     * @default true
     */
    enableCache?: boolean;
}

/**
 * SMTP configuration for plugin-level notifications (e.g. gate approval emails)
 */
export interface NotificationSmtpConfig {
    host: string;
    port: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
    /** Sender address for notification emails */
    from?: string;
}

/**
 * Security configuration options
 */
export interface SecurityConfig {
    /**
     * SSRF (Server-Side Request Forgery) protection settings
     * Controls URL validation for outbound HTTP requests
     */
    ssrf?: UrlSecurityConfig;

    /**
     * Script operator security settings
     * Controls code execution, validation, and sandboxing for user-provided scripts
     */
    script?: ScriptSecurityConfig;
}

export interface DataHubPluginOptions {
    enabled?: boolean;
    registerBuiltinAdapters?: boolean;
    retentionDaysRuns?: number;
    retentionDaysErrors?: number;
    pipelines?: CodeFirstPipeline[];
    secrets?: CodeFirstSecret[];
    connections?: CodeFirstConnection[];
    adapters?: unknown[];
    feedGenerators?: CustomFeedGenerator[];
    configPath?: string;
    debug?: boolean;
    enableDashboard?: boolean;
    runtime?: RuntimeLimitsConfig;
    /**
     * Security configuration options
     * Configure SSRF protection, URL validation, and other security features
     */
    security?: SecurityConfig;
    /**
     * Notification configuration for gate approvals and pipeline alerts
     */
    notifications?: {
        /** SMTP settings for gate approval notification emails */
        smtp?: NotificationSmtpConfig;
    };
}

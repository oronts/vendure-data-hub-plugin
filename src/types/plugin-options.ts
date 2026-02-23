import type { CustomFeedGenerator } from '../feeds/generators/feed-types';
import type {
    RuntimeLimitsConfig,
    CodeFirstPipeline,
    CodeFirstSecret,
    CodeFirstConnection,
    JsonObject,
    ScriptFunction,
} from '../../shared/types';
import type { UrlSecurityConfig } from '../utils/url-security.utils';
import type { CodeSecurityConfig } from '../utils/code-security.utils';
import type { ConnectorDefinition, BaseConnectorConfig } from '../../connectors/types';

/**
 * Custom import template registered via plugin options.
 *
 * Developers can register their own import templates that appear
 * in the import wizard alongside built-in templates.
 */
export interface CustomImportTemplate {
    /** Unique template identifier */
    id: string;
    /** Display name */
    name: string;
    /** Detailed description of what this template does */
    description: string;
    /** Category for grouping (e.g. 'products', 'customers', 'inventory') */
    category: string;
    /** Icon name from lucide-react */
    icon?: string;
    /** Fields that must be present in source data */
    requiredFields: string[];
    /** Fields that can optionally be mapped */
    optionalFields?: string[];
    /** Example data rows for preview */
    sampleData?: JsonObject[];
    /** Whether template is featured/recommended */
    featured?: boolean;
    /** Tags for filtering and search */
    tags?: string[];
    /** Supported file formats (e.g. ['CSV', 'JSON']) */
    formats?: string[];
    /** Pipeline definition hints to pre-fill wizard steps */
    definition?: {
        sourceType?: string;
        fileFormat?: string;
        targetEntity?: string;
        existingRecords?: string;
        lookupFields?: string[];
        fieldMappings?: { sourceField: string; targetField: string }[];
    };
}

/**
 * Custom export template registered via plugin options.
 *
 * Developers can register their own export templates that appear
 * in the export wizard alongside built-in templates.
 */
export interface CustomExportTemplate {
    /** Unique template identifier */
    id: string;
    /** Display name */
    name: string;
    /** Detailed description of what this template does */
    description: string;
    /** Icon name from lucide-react */
    icon?: string;
    /** Export format (e.g. 'CSV', 'JSON', 'XML') */
    format: string;
    /** Fields that must be selected for export */
    requiredFields?: string[];
    /** Tags for filtering and search */
    tags?: string[];
    /** Export definition hints to pre-fill wizard steps */
    definition?: {
        sourceEntity?: string;
        fields?: string[];
        formatOptions?: Record<string, unknown>;
    };
}

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
    /**
     * Connectors to register with the plugin.
     * Templates, extractors, and loaders from registered connectors are
     * automatically available in the wizard UI and pipeline editor.
     *
     * @example
     * ```ts
     * import { PimcoreConnector } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';
     *
     * DataHubPlugin.init({
     *     connectors: [
     *         PimcoreConnector({
     *             connection: { endpoint: 'https://pim.example.com/pimcore-graphql/...' },
     *         }),
     *     ],
     * });
     * ```
     */
    connectors?: Array<{ definition: Pick<ConnectorDefinition, 'importTemplates' | 'exportTemplates' | 'extractors' | 'loaders'>; config: BaseConnectorConfig }>;
    /**
     * Custom import templates to register for the import wizard.
     * These appear alongside built-in templates in the wizard UI.
     */
    importTemplates?: CustomImportTemplate[];
    /**
     * Custom export templates to register for the export wizard.
     * These appear alongside built-in templates in the wizard UI.
     */
    exportTemplates?: CustomExportTemplate[];
    /**
     * Named script functions to register for use in pipeline hook actions.
     *
     * Scripts registered here are available as SCRIPT hook actions in pipeline definitions.
     * They can modify records at any hook stage (BEFORE_TRANSFORM, AFTER_EXTRACT, etc.).
     *
     * @example
     * ```ts
     * DataHubPlugin.init({
     *     scripts: {
     *         'validate-sku': async (records, context) => {
     *             return records.filter(r => r.sku && String(r.sku).length > 0);
     *         },
     *         'enrich-pricing': async (records, context) => {
     *             return records.map(r => ({ ...r, price: Number(r.price) * 100 }));
     *         },
     *     },
     * });
     * ```
     */
    scripts?: Record<string, ScriptFunction>;
}

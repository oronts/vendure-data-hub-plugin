import type { CustomFeedGenerator } from '../feeds/generators/feed-types';
import type { Injector } from '@vendure/core';
import type {
    RuntimeLimitsConfig,
    CodeFirstPipeline,
    CodeFirstSecret,
    CodeFirstConnection,
    JsonObject,
    ScriptFunction,
} from '../../shared/types';
import type { AdapterDefinition, DataHubAdapter } from '../sdk/types/adapter-types';
import type { UrlSecurityConfig } from '../utils/url-security.utils';
import type { CodeSecurityConfig } from '../utils/code-security.utils';
import type { ConnectorDefinition, BaseConnectorConfig } from '../../connectors/types';

export interface DataHubAdapterFactory {
    /** Stable identifier used for bootstrap diagnostics. */
    readonly code: string;
    /** Pure metadata used by tooling that validates definitions without booting Nest. */
    readonly definition: AdapterDefinition;
    /** Resolve Vendure/Nest services and construct the executable adapter. */
    create(injector: Injector): DataHubAdapter | Promise<DataHubAdapter>;
}

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
    CircuitBreakerConfig,
    SchedulerConfig,
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
     * Default timeout for script execution in milliseconds
     * @default 5000
     */
    defaultTimeoutMs?: number;
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

/**
 * Optional vendor-neutral OpenTelemetry export over OTLP/HTTP JSON.
 *
 * Export is asynchronous and bounded. The endpoint is treated as a collector
 * base URL; /v1/metrics and /v1/traces are appended automatically.
 */
export interface OtlpTelemetryConfig {
    /** Collector base URL, for example https://otel-collector:4318. */
    endpoint: string;
    /** Set to false to keep a shared configuration object while disabling export. */
    enabled?: boolean;
    /** Export cumulative in-memory metrics. @default true */
    metrics?: boolean;
    /** Export completed Data Hub spans. @default true */
    traces?: boolean;
    /** OTLP request headers, such as collector authentication. Values are never logged. */
    headers?: Record<string, string>;
    /** Optional private-CA or mutual-TLS material loaded from local PEM files. */
    tls?: OtlpTelemetryTlsConfig;
    /** OpenTelemetry service.name resource attribute. */
    serviceName?: string;
    /** Optional OpenTelemetry service.version resource attribute. */
    serviceVersion?: string;
    /** Optional OpenTelemetry deployment.environment.name resource attribute. */
    environment?: string;
    /** Period between background exports in milliseconds. @default 30000 */
    exportIntervalMs?: number;
    /** Per-request timeout in milliseconds. @default 5000 */
    requestTimeoutMs?: number;
    /** Maximum completed spans waiting for export. @default 2048 */
    maxQueueSize?: number;
    /** Maximum spans sent in one request. @default 256 */
    maxBatchSize?: number;
    /** Maximum encoded OTLP request body size in bytes. @default 67108864 */
    maxRequestBodyBytes?: number;
}

export interface OtlpTelemetryTlsConfig {
    /** PEM certificate authorities used only for this collector connection. */
    caFile?: string;
    /** PEM client certificate chain. Must be paired with clientKeyFile. */
    clientCertificateFile?: string;
    /** PEM client private key. Must be paired with clientCertificateFile. */
    clientKeyFile?: string;
    /** Optional passphrase for an encrypted client private key. */
    clientKeyPassphrase?: string;
}

export interface DataHubPluginOptions {
    enabled?: boolean;
    registerBuiltinAdapters?: boolean;
    retentionDaysRuns?: number;
    retentionDaysErrors?: number;
    pipelines?: CodeFirstPipeline[];
    secrets?: CodeFirstSecret[];
    connections?: CodeFirstConnection[];
    adapters?: DataHubAdapter[];
    adapterFactories?: DataHubAdapterFactory[];
    feedGenerators?: CustomFeedGenerator[];
    configPath?: string;
    debug?: boolean;
    runtime?: RuntimeLimitsConfig;
    /**
     * Security configuration options
     * Configure SSRF protection, URL validation, and other security features
     */
    security?: SecurityConfig;
    /**
     * Optional OpenTelemetry metrics and trace export over OTLP/HTTP JSON.
     * No telemetry leaves the process unless this option is configured.
     */
    telemetry?: OtlpTelemetryConfig;
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
     * import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
     * import { PimcoreConnector } from '@oronts/vendure-data-hub-plugin/connectors/pimcore';
     *
     * const pimcore = PimcoreConnector({
     *     connectionCode: 'pimcore-graphql',
     * });
     *
     * DataHubPlugin.init({
     *     connectors: [pimcore],
     *     pipelines: pimcore.pipelines,
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

import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import { DATAHUB_PLUGIN_OPTIONS } from './constants/index';
import { DataHubPluginOptions } from './types/index';
// Pipeline entities
import { Pipeline, PipelineRun, PipelineRevision, PipelineLog } from './entities/pipeline';
// Data entities
import { DataHubCheckpoint, DataHubRecordError, DataHubRecordRetryAudit } from './entities/data';
// Config entities
import { DataHubConnection, DataHubSecret, DataHubSettings, DataHubLock } from './entities/config';
import { adminApiExtensions } from './api/api-extensions';
import { DataHubPipelineAdminResolver } from './api/resolvers/pipeline.resolver';
import { DataHubAdapterAdminResolver } from './api/resolvers/adapter.resolver';
import { DataHubErrorAdminResolver } from './api/resolvers/error.resolver';
import { DataHubCheckpointAdminResolver } from './api/resolvers/checkpoint.resolver';
import { DataHubSecretAdminResolver } from './api/resolvers/secret.resolver';
import { DataHubHookAdminResolver } from './api/resolvers/hook.resolver';
import { DataHubQueueAdminResolver } from './api/resolvers/queue.resolver';
import { DataHubWebhookController } from './api/controllers/webhook.controller';
import {
    PipelineService,
    PipelineRunnerService,
    DefinitionValidationService,
    PipelineFormatService,
    RecordErrorService,
    CheckpointService,
    RecordRetryAuditService,
    ErrorReplayService,
    SecretService,
    HookService,
    DataHubEventTriggerService,
    DataHubRetentionService,
    ConnectionService,
    DataHubSettingsService,
    DomainEventsService,
    PipelineLogService,
    FileStorageService,
    WebhookRetryService,
    ExportDestinationService,
    AnalyticsService,
    RateLimitService,
    MessageConsumerService,
    StepTestService,
} from './services';
import { RateLimitServiceHolder } from './decorators';
import { DATAHUB_PERMISSION_DEFINITIONS } from './permissions';
import { DataHubRunQueueHandler, DataHubScheduleHandler } from './jobs';
import { DataHubRegistryService } from './sdk/registry.service';
import { AdapterBootstrapService, ConfigSyncService } from './bootstrap';
import { AdapterRuntimeService } from './runtime/adapter-runtime.service';
import { DataHubConnectionAdminResolver } from './api/resolvers/connection.resolver';
import { DataHubSettingsAdminResolver } from './api/resolvers/settings.resolver';
import { DataHubEventsAdminResolver } from './api/resolvers/events.resolver';
import { DataHubLogAdminResolver } from './api/resolvers/log.resolver';
import { DataHubTestAdminResolver } from './api/resolvers/test.resolver';
import { FileParserService } from './parsers/file-parser.service';
import { FieldMapperService, AutoMapperService } from './mappers';
import { FeedGeneratorService } from './feeds/feed-generator.service';
import { DataHubFeedAdminResolver } from './api/resolvers/feed.resolver';
import { DataHubAnalyticsAdminResolver } from './api/resolvers/analytics.resolver';
import { DataHubFileUploadController } from './api/controllers/file-upload.controller';
// Transform and Loader services
import { TransformExecutor } from './transforms/transform-executor';
import { ProductVariantLoader } from './loaders/product-variant';
import { ProductLoader } from './loaders/product';
import { CustomerLoader } from './loaders/customer';
import { CollectionLoader } from './loaders/collection';
import { FacetLoader } from './loaders/facet';
import { FacetValueLoader } from './loaders/facet-value';
import { PromotionLoader } from './loaders/promotion';
import { CustomerGroupLoader } from './loaders/customer-group';
import { AssetLoader } from './loaders/asset';
import { OrderLoader } from './loaders/order';
import { StockLocationLoader } from './loaders/stock-location';
import { InventoryLoader } from './loaders/inventory';
import { ShippingMethodLoader } from './loaders/shipping-method';
import { TaxRateLoader } from './loaders/tax-rate';
import { PaymentMethodLoader } from './loaders/payment-method';
import { ChannelLoader } from './loaders/channel';
import { LoaderRegistryService } from './loaders/registry';
// Logger Service
import { DataHubLoggerFactory, ExecutionLogger } from './services/logger';
// Extractor Services
import { ExtractorRegistryService } from './extractors/extractor-registry.service';
import { HttpApiExtractor } from './extractors/http-api';
import { WebhookExtractor } from './extractors/webhook';
import { VendureQueryExtractor } from './extractors/vendure-query';
import { FileExtractor } from './extractors/file';
import { FtpExtractor } from './extractors/ftp';
import { S3Extractor } from './extractors/s3';
import { DatabaseExtractor } from './extractors/database';
import { GraphQLExtractor } from './extractors/graphql';
import { CdcExtractor } from './extractors/cdc';
import { DataHubExtractorAdminResolver } from './api/resolvers/extractor.resolver';
import { EntitySchemaAdminResolver } from './api/resolvers/entity-schema.resolver';
import { DataHubVersioningResolver } from './api/resolvers/versioning.resolver';
import { DataHubSandboxResolver } from './api/resolvers/sandbox.resolver';
import { DataHubSubscriptionResolver } from './api/resolvers/subscription.resolver';
import { DataHubGateAdminResolver } from './api/resolvers/gate.resolver';
// Versioning Services
import { DiffService, RevisionService, ImpactAnalysisService, RiskAssessmentService, SandboxService } from './services/versioning';
// Runtime Services
import { RuntimeConfigService, CircuitBreakerService, BatchRollbackService, DistributedLockService } from './services/runtime';
// Runtime Executors
import { ExtractExecutor } from './runtime/executors/extract.executor';
import { TransformExecutor as RuntimeTransformExecutor } from './runtime/executors/transform.executor';
import { LoadExecutor } from './runtime/executors/load.executor';
import { ExportExecutor } from './runtime/executors/export.executor';
import { FeedExecutor } from './runtime/executors/feed.executor';
import { SinkExecutor } from './runtime/executors/sink.executor';
import { GateExecutor } from './runtime/executors/gate.executor';
import { GateStepStrategy } from './runtime/orchestration/step-strategies';
// Loader Handlers (used by LoadExecutor)
import {
    ProductHandler,
    VariantHandler,
    CustomerHandler,
    OrderNoteHandler,
    ApplyCouponHandler,
    OrderTransitionHandler,
    StockAdjustHandler,
    CollectionHandler,
    PromotionHandler,
    AssetAttachHandler,
    AssetImportHandler,
    FacetHandler,
    FacetValueHandler,
    RestPostHandler,
    GraphqlMutationHandler,
    TaxRateHandler,
    PaymentMethodHandler,
    ChannelHandler,
} from './runtime/executors/loaders';

/**
 * Data Hub Plugin - ETL (Extract, Transform, Load) data integration plugin for Vendure.
 *
 * Build data pipelines to import products, sync inventory, generate product feeds,
 * index to search engines, and integrate with external systems.
 *
 * Features:
 * - Visual pipeline builder with drag-and-drop interface
 * - Code-first DSL for programmatic pipeline definition
 * - Data extractors (REST, GraphQL, CSV, JSON, Database, S3, FTP/SFTP)
 * - Entity loaders for all Vendure entities
 * - Transform operators for data manipulation
 * - Feed generators (Google, Meta, Amazon, Custom)
 * - Search sinks (Elasticsearch, MeiliSearch, Algolia, Typesense)
 * - Scheduling, checkpointing, and real-time monitoring
 *
 * @category Plugin
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [Pipeline, PipelineRun, DataHubRecordError, DataHubCheckpoint, DataHubRecordRetryAudit, DataHubSecret, PipelineRevision, DataHubConnection, DataHubSettings, PipelineLog, DataHubLock],
    providers: [
        // Runtime Configuration Services
        RuntimeConfigService,
        CircuitBreakerService,
        BatchRollbackService,
        DistributedLockService,
        // Core Services
        PipelineService,
        PipelineRunnerService,
        AdapterRuntimeService,
        DataHubRegistryService,
        AdapterBootstrapService,
        ConfigSyncService,
        DataHubRunQueueHandler,
        RecordErrorService,
        CheckpointService,
        RecordRetryAuditService,
        ErrorReplayService,
        DataHubScheduleHandler,
        SecretService,
        HookService,
        DataHubEventTriggerService,
        MessageConsumerService,
        DataHubRetentionService,
        ConnectionService,
        DomainEventsService,
        DataHubSettingsService,
        PipelineLogService,
        // File & Mapping Services
        FileParserService,
        FieldMapperService,
        AutoMapperService,
        // Transform & Loader Services
        TransformExecutor,
        // Runtime Executors (for AdapterRuntimeService)
        ExtractExecutor,
        RuntimeTransformExecutor,
        LoadExecutor,
        ExportExecutor,
        FeedExecutor,
        SinkExecutor,
        GateExecutor,
        GateStepStrategy,
        // Loader Handlers (used by LoadExecutor)
        ProductHandler,
        VariantHandler,
        CustomerHandler,
        OrderNoteHandler,
        ApplyCouponHandler,
        OrderTransitionHandler,
        StockAdjustHandler,
        CollectionHandler,
        PromotionHandler,
        AssetAttachHandler,
        AssetImportHandler,
        FacetHandler,
        FacetValueHandler,
        RestPostHandler,
        GraphqlMutationHandler,
        TaxRateHandler,
        PaymentMethodHandler,
        ChannelHandler,
        // Entity Loaders - Products
        ProductVariantLoader,
        ProductLoader,
        // Entity Loaders - Customers
        CustomerLoader,
        CustomerGroupLoader,
        // Entity Loaders - Catalog
        CollectionLoader,
        FacetLoader,
        FacetValueLoader,
        // Entity Loaders - Commerce
        PromotionLoader,
        OrderLoader,
        ShippingMethodLoader,
        PaymentMethodLoader,
        // Entity Loaders - Tax & Channel
        TaxRateLoader,
        ChannelLoader,
        // Entity Loaders - Inventory
        StockLocationLoader,
        InventoryLoader,
        // Entity Loaders - Media
        AssetLoader,
        // Loader Registry
        LoaderRegistryService,
        // Logger Factory and Execution Logger
        DataHubLoggerFactory,
        ExecutionLogger,
        // Rate Limiting Service
        RateLimitService,
        RateLimitServiceHolder,
        // Extractor Services
        ExtractorRegistryService,
        HttpApiExtractor,
        WebhookExtractor,
        VendureQueryExtractor,
        FileExtractor,
        FtpExtractor,
        S3Extractor,
        DatabaseExtractor,
        GraphQLExtractor,
        CdcExtractor,
        // DataHub services
        FileStorageService,
        WebhookRetryService,
        ExportDestinationService,
        AnalyticsService,
        FeedGeneratorService,
        // Resolvers
        DataHubFeedAdminResolver,
        DataHubAnalyticsAdminResolver,
        DataHubPipelineAdminResolver,
        DataHubAdapterAdminResolver,
        DataHubErrorAdminResolver,
        DataHubSecretAdminResolver,
        DataHubCheckpointAdminResolver,
        DataHubHookAdminResolver,
        DataHubQueueAdminResolver,
        DataHubConnectionAdminResolver,
        DataHubSettingsAdminResolver,
        DataHubEventsAdminResolver,
        DataHubLogAdminResolver,
        DataHubExtractorAdminResolver,
        EntitySchemaAdminResolver,
        DataHubVersioningResolver,
        DataHubSandboxResolver,
        DataHubSubscriptionResolver,
        DataHubTestAdminResolver,
        DataHubGateAdminResolver,
        // Versioning Services
        DiffService,
        RevisionService,
        ImpactAnalysisService,
        RiskAssessmentService,
        SandboxService,
        // Validation
        DefinitionValidationService,
        // Format conversion
        PipelineFormatService,
        // Testing Services
        StepTestService,
        {
            provide: DATAHUB_PLUGIN_OPTIONS,
            useFactory: () => DataHubPlugin.options,
        },
    ],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [
            DataHubPipelineAdminResolver,
            DataHubAdapterAdminResolver,
            DataHubErrorAdminResolver,
            DataHubSecretAdminResolver,
            DataHubCheckpointAdminResolver,
            DataHubHookAdminResolver,
            DataHubQueueAdminResolver,
            DataHubConnectionAdminResolver,
            DataHubSettingsAdminResolver,
            DataHubEventsAdminResolver,
            DataHubLogAdminResolver,
            DataHubTestAdminResolver,
            DataHubFeedAdminResolver,
            DataHubAnalyticsAdminResolver,
            DataHubExtractorAdminResolver,
            EntitySchemaAdminResolver,
            DataHubVersioningResolver,
            DataHubSandboxResolver,
            DataHubSubscriptionResolver,
            DataHubGateAdminResolver,
        ],
    },
    controllers: [DataHubWebhookController, DataHubFileUploadController],
    dashboard: '../dashboard/index.tsx',
    configuration: config => {
        // Register custom permissions
        const existing = config.authOptions.customPermissions ?? [];
        config.authOptions.customPermissions = [...existing, ...DATAHUB_PERMISSION_DEFINITIONS];
        return config;
    },
    compatibility: '^3.0.0',
})
export class DataHubPlugin {
    /** @internal */
    static options: DataHubPluginOptions = { enabled: true };

    /**
     * Initialize the Data Hub plugin with configuration options.
     *
     * @example
     * ```ts
     * import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
     *
     * export const config: VendureConfig = {
     *     plugins: [
     *         DataHubPlugin.init({
     *             enabled: true,
     *             pipelines: [{
     *                 code: 'product-sync',
     *                 name: 'Product Sync',
     *                 enabled: true,
     *                 definition: myPipelineDefinition,
     *             }],
     *         }),
     *     ],
     * };
     * ```
     *
     * @param options - Plugin configuration options
     * @returns Configured DataHubPlugin class
     */
    static init(options: DataHubPluginOptions = { enabled: true }): Type<DataHubPlugin> {
        this.options = options;
        return DataHubPlugin;
    }
}

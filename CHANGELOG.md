# Changelog

All notable changes to the Data Hub Plugin are documented here.

## [Unreleased]

### Added

- Script caching for hook interceptors with bounded LRU eviction (`MAX_SCRIPT_CACHE=100`)
- Shared utility functions: string-case conversions, ID generation, query-key factory
- Gate events (`GateApprovalRequested`, `GateApproved`, `GateRejected`, `GateTimeout`) and trigger events (`TriggerFired`, `ScheduleActivated`, `ScheduleDeactivated`) documentation in `events.md`
- `TriggerSchemaFields` component supports `select`, `boolean`, and `number` field types

### Fixed

- Standardized `PipelineRunCancelled` event name across linear and graph executors
- Error propagation in load executor now surfaces root cause correctly
- Gate timeout delay tracking uses monotonic time reference
- Distributed lock eviction logs warning when map reaches capacity
- Type-safe incremental comparison in database extractor (consistent column types)

### Improved

- DRY: extracted duplicated patterns into shared utilities (string-case, ID generation, query-key factory)
- Documentation accuracy: custom-extractors imports, enrich step config fields, operator lookup descriptions

## [1.1.0] - 2026-02-17

### Added

- **Import & Export Wizards** - Step-by-step guided wizards for creating import and export pipelines without using the raw pipeline editor
  - Import Wizard: source selection, entity targeting, field mapping, strategy configuration, scheduling
  - Export Wizard: entity selection, field picking, format configuration, destination setup, scheduling
  - Template system: pre-configured blueprints that pre-fill wizard steps for common scenarios
  - Accessible from the Pipelines list page via dedicated buttons

- **Built-in Import Templates** (6 templates)
  - REST API Product Sync (featured)
  - JSON Product Import
  - Magento Product Export CSV (featured)
  - XML Product Feed Import
  - ERP Inventory Sync (featured)
  - CRM Customer Sync

- **Built-in Export Templates** (8 dashboard templates + 4 plugin defaults)
  - Google Merchant Center Feed (featured)
  - Meta (Facebook) Catalog Feed (featured)
  - Amazon Product Feed
  - Product Catalog CSV (featured)
  - Product Catalog JSON
  - Customer Export CSV
  - Order Export CSV
  - Inventory Report CSV
  - Product XML Feed (plugin default)
  - Order Analytics CSV (plugin default)
  - Customer GDPR Export (plugin default)
  - Inventory Reconciliation Report (plugin default)

- **Custom Template Registration** via `importTemplates` and `exportTemplates` in `DataHubPluginOptions`
  - Templates appear alongside built-in ones in the wizard UI
  - Support field mapping definitions for automatic pre-fill
  - `TemplateRegistryService` for runtime template registration

- **Programmatic Script Hooks** via `scripts` in `DataHubPluginOptions`
  - Register named `ScriptFunction` handlers at plugin init
  - Scripts auto-register on startup via `HookService`
  - Reference scripts by name in pipeline SCRIPT hook actions
  - Full access to records, `HookContext` (pipelineId, runId, stage), and optional args
  - Can filter, transform, enrich, or reject records at any of the 18 hook stages

- **Connector Template System** - Connectors can now ship `importTemplates` and `exportTemplates`
  - Pimcore connector ships 4 import templates (Product, Category, Asset, Facet Sync) and 1 export template
  - `ConnectorRegistry` provides `getImportTemplates()`, `getExportTemplates()`, and `getPluginTemplates()` methods
  - Spread connector templates into `DataHubPlugin.init()` to make them appear in the wizard UI

- **Pipeline Event Type Exports** - Public API now exports event type constants and their TypeScript types:
  - `RUN_EVENT_TYPES`, `WEBHOOK_EVENT_TYPES`, `STEP_EVENT_TYPES`, `LOG_EVENT_TYPES`, `PIPELINE_EVENT_TYPES`
  - Corresponding type exports: `RunEventType`, `WebhookEventType`, `StepEventType`, `LogEventType`, `PipelineEventType`

### Changed

- `DataHubPlugin.options` default now includes `importTemplates` and `exportTemplates` from built-in defaults
- `HookService` now accepts `DATAHUB_PLUGIN_OPTIONS` injection and auto-registers scripts from plugin options on init
- `ConnectorDefinition` interface extended with optional `importTemplates` and `exportTemplates` fields

## [1.0.0] - 2026-02-16

### Production Readiness

- 74 audit rounds completed across backend, dashboard, SDK, connectors, and docs
- Zero TODO/FIXME/HACK markers, zero `as any` casts, zero dead code
- All enums use SCREAMING_SNAKE_CASE, hooks use kebab-case, .tsx files use PascalCase
- TypeScript compiles clean (`npx tsc --noEmit`)

### Security

- SSRF protection on all outbound HTTP requests (webhook, extractor, API calls)
- SQL injection guards on dynamic queries
- Sandboxed evaluator for user-provided expressions (vm module with frozen builtins)
- Encrypted secret storage with provider abstraction (ENV, INLINE)
- Channel isolation properly enforced through resolvers and services
- Code security validation for interceptor hooks (dangerous pattern detection)

### Features

- Full ETL pipeline engine: Extract (9 extractors) -> Transform (61 operators across 11 categories) -> Load (22 loaders) -> Export/Feed
- Visual drag-and-drop pipeline builder with simple and workflow modes
- Code-first DSL with `createPipeline()` builder and typed configurations
- 9 data extractors: REST API, GraphQL, File (CSV/JSON/XML/XLSX), Database, S3, FTP/SFTP, Vendure Query, Webhook, CDC
- 22 loaders: Product, Variant, Customer, Customer Group, Collection, Facet, FacetValue, Promotion, Order (Note, Transition, Coupon), Shipping Method, Stock Location, Stock/Inventory, Asset (Attach, Import), Tax Rate, Payment Method, Channel, GraphQL Mutation, REST POST
- 61 transform operators across 11 categories (string, numeric, date, logic, JSON, data, enrichment, aggregation, validation, script, file)
- Product feed generators: Google Shopping, Meta/Facebook Catalog, Amazon, custom XML/JSON
- Search sinks: Elasticsearch, MeiliSearch, Algolia, Typesense
- Pipeline hooks: 18 stages with INTERCEPTOR, SCRIPT, WEBHOOK, EMIT, TRIGGER_PIPELINE, LOG action types
- Gate steps for human approval workflows (MANUAL, THRESHOLD, TIMEOUT)
- Pipeline versioning with diff, revision history, impact analysis, and risk assessment
- Real-time pipeline monitoring with WebSocket subscriptions
- Error quarantine with retry, replay, and dead letter queue
- Checkpointing for resumable pipeline runs
- Distributed locking for concurrent execution safety
- Rate limiting and circuit breaker patterns
- Scheduling with cron expressions and interval triggers
- Pimcore PIM/DAM connector with 4 sync pipelines
- 18 GraphQL resolvers + 2 REST controllers
- Comprehensive permission system (27 permissions)

## [0.1.0] - 2026-01-30

### Added

#### Core Features
- **Pipeline DSL Builder**: Fluent TypeScript API for defining ETL pipelines
- **Visual Pipeline Editor**: React Flow-based drag-and-drop pipeline designer
- **Step Types**: TRIGGER, EXTRACT, TRANSFORM, VALIDATE, ENRICH, ROUTE, LOAD, EXPORT, FEED, SINK, GATE
- **61 Built-in Operators**: Data transformation operators for common ETL tasks
- **Adapter Registry**: Extensible adapter system for custom extractors, loaders, and operators

#### Enterprise Features
- **Distributed Locking**: Redis, PostgreSQL, and in-memory lock backends for horizontal scaling
- **Rate Limiting**: Configurable rate limits with standard headers
- **Circuit Breaker**: Fault tolerance with automatic recovery
- **Secret Management**: Secure secrets with multiple providers (inline, env, config)
- **Secret Encryption**: AES-256-GCM encryption at rest for INLINE secrets (requires DATAHUB_MASTER_KEY)

#### Security
- **SSRF Protection**: URL validation blocking private IPs and cloud metadata
- **SQL Injection Prevention**: Input validation and identifier escaping
- **Code Sandboxing**: Safe expression evaluator with whitelist-based validation
- **Path Traversal Protection**: Secure file path handling
- **Webhook Authentication**: API key, HMAC, Basic Auth, and JWT support

#### Integrations
- **Vendure Loaders**: Product, Variant, Customer, Collection, Facet, FacetValue, Asset, Order, Stock, Promotion, TaxRate, PaymentMethod, Channel, CustomerGroup, ShippingMethod management
- **File Extractors**: CSV, JSON, XML with streaming support
- **API Extractors**: REST, GraphQL with pagination
- **Data Source Extractors**: Database, S3, FTP/SFTP, Webhook, CDC (Change Data Capture)
- **Feed Generators**: Google Merchant, Meta Catalog, Amazon Seller Central, Custom CSV/JSON/XML
- **Sink Adapters**: Elasticsearch, Meilisearch, Algolia, Typesense, Queue Producer, Webhook

#### Dashboard
- **Pipeline Management**: Create, edit, clone, version pipelines
- **Visual Editor**: Drag-and-drop pipeline design with React Flow
- **Run Monitoring**: Real-time run status and log viewing
- **Dry Run**: Test pipelines with sample data before execution
- **Connection Manager**: Manage external service connections
- **Secret Manager**: Secure secret storage and management
- **Webhook Management**: Configure and test webhook endpoints
- **Analytics Dashboard**: Pipeline execution metrics and trends

#### Developer Experience
- **TypeScript SDK**: Full type safety for pipeline definitions
- **Code-First Pipelines**: Define pipelines programmatically
- **Hook System**: 18 hook stages for customization
- **Custom Adapters**: Register custom extractors, operators, and loaders
- **Documentation**: User guides, developer guides, and API reference

### Security Notes
- Secrets stored with INLINE provider are encrypted at rest when DATAHUB_MASTER_KEY environment variable is configured
- Generate a master key: `openssl rand -hex 32`
- Without encryption configured, INLINE secrets are stored as plain text (warning logged at startup)

### Configuration
- Plugin options for customizing behavior
- Environment variable support for all sensitive configuration
- External configuration file support

### Documentation
- Getting Started guide
- User Guide with pipeline examples
- Developer Guide for extending the plugin
- Production Deployment guide
- API Reference

---

## Migration Notes

### From Pre-release to 0.1.0

If upgrading from a pre-release version:

1. **Database Migration**: Run Vendure migrations to create new tables
   ```bash
   npx vendure migrate
   ```

2. **Secret Encryption**: To enable encryption for existing secrets:
   - Set DATAHUB_MASTER_KEY environment variable
   - Re-save existing INLINE secrets through the UI (they will be encrypted on save)

3. **Breaking Changes**: None - this is the initial release

---

## Support

- **Issues**: [GitHub Issues](https://github.com/oronts/vendure-data-hub-plugin/issues)
- **Documentation**: See `/docs` folder
- **Examples**: See `/dev-server/examples` folder

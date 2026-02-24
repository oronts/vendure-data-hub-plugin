# Changelog

All notable changes to the Data Hub Plugin are documented here.

## [0.1.1] - 2026-02-24

### Fixed
- Fixed package.json entry points: Updated `main` and `types` paths from `dist/index.js` to `dist/src/index.js` to match actual build output structure

## [0.1.0] - 2026-02-24

Initial production release of the Data Hub Plugin for Vendure.

### Core Features

#### ETL Pipeline Engine
- **Full pipeline orchestration**: Extract → Transform → Validate → Enrich → Route → Load → Export/Feed/Sink
- **10 step types**: TRIGGER, EXTRACT, TRANSFORM, VALIDATE, ENRICH, ROUTE, LOAD, EXPORT, FEED, SINK, GATE
- **2 execution modes**: Linear (sequential) and Graph (parallel DAG)
- **Checkpoint system**: Resumable pipeline runs with state persistence
- **Error handling**: Quarantine, retry, replay, dead letter queue
- **Dry run mode**: Test pipelines with sample data before execution

#### Data Extractors (9 Built-in)
1. **HTTP REST API** - Paginated REST endpoint extraction with authentication
2. **GraphQL API** - GraphQL query execution with cursor/offset pagination
3. **Vendure Query** - Native Vendure entity queries
4. **File** - CSV, JSON, XML, XLSX file parsing with streaming
5. **Database** - SQL database extraction (PostgreSQL, MySQL, SQL Server) with incremental sync
6. **S3** - AWS S3 and compatible object storage
7. **FTP/SFTP** - File transfer protocol servers
8. **Webhook** - Incoming webhook data capture
9. **CDC** - Change Data Capture for real-time database sync

#### Transform Operators (61 Built-in)

**String Operations** (12): split, join, trim, lowercase, uppercase, slugify, concat, replace, extractRegex, replaceRegex, stripHtml, truncate

**Numeric Operations** (9): math, currency, unit, toNumber, toString, parseNumber, formatNumber, toCents, round

**Date Operations** (5): dateFormat, dateParse, dateAdd, dateDiff, now

**Logic Operations** (4): when, ifThenElse, switch, deltaFilter

**JSON Operations** (4): parseJson, stringifyJson, pick, omit

**Data Operations** (8): map, set, remove, rename, copy, template, hash, uuid

**Enrichment Operations** (5): lookup, coalesce, enrich, default, httpLookup

**Aggregation Operations** (8): aggregate, count, unique, flatten, first, last, expand, multiJoin

**Validation Operations** (2): validateRequired, validateFormat

**Script Operation** (1): script (custom JavaScript transform)

**File Operations** (3): imageResize, imageConvert, pdfGenerate

#### Entity Loaders (22 Built-in)

**Vendure Entity Loaders** (16):
- Product (create/update with variants, pricing, assets)
- ProductVariant (SKU-based variant management)
- Customer (customer accounts with groups)
- CustomerGroup (customer segmentation)
- Collection (product categorization with hierarchy)
- Facet (attribute definitions)
- FacetValue (attribute values)
- Promotion (discount rules)
- Order (order management with transitions, notes, coupons)
- ShippingMethod (shipping configuration)
- StockLocation (warehouse locations)
- Inventory (stock level management with adjustments)
- Asset (media management with import)
- TaxRate (tax configuration)
- PaymentMethod (payment providers)
- Channel (multi-channel commerce)

**Operation Loaders** (6):
- REST POST (generic HTTP API calls)
- GraphQL Mutation (GraphQL API calls)
- Order Note (add notes to orders)
- Order Transition (change order states)
- Apply Coupon (apply discount codes)
- Stock Adjust (adjust inventory levels)

#### Field Transforms (49 Built-in)

**String** (16): TRIM, LOWERCASE, UPPERCASE, SLUGIFY, TRUNCATE, PAD, REPLACE, REGEX_REPLACE, REGEX_EXTRACT, SPLIT, JOIN, CONCAT, TEMPLATE, STRIP_HTML, ESCAPE_HTML, TITLE_CASE, SENTENCE_CASE

**Number** (10): PARSE_NUMBER, PARSE_FLOAT, PARSE_INT, ROUND, FLOOR, CEIL, ABS, TO_CENTS, FROM_CENTS, MATH

**Date** (3): PARSE_DATE, FORMAT_DATE, NOW

**Boolean** (2): PARSE_BOOLEAN, NEGATE

**Type Conversion** (6): TO_STRING, TO_NUMBER, TO_BOOLEAN, TO_ARRAY, TO_JSON, PARSE_JSON

**MAP** (1): MAP

**Conditional** (3): IF_ELSE, COALESCE, DEFAULT

**Array** (6): FIRST, LAST, NTH, FILTER, MAP_ARRAY, FLATTEN

**Expression** (1): EXPRESSION (custom JS expressions)

**Async** (1): LOOKUP (external data enrichment)

#### Triggers (6 Types)
1. **MANUAL** - On-demand execution via dashboard or API
2. **SCHEDULE** - Cron-based scheduling with timezone support
3. **WEBHOOK** - HTTP webhook endpoints with authentication (API key, HMAC, Basic, JWT)
4. **EVENT** - Vendure event subscriptions (ProductEvent, OrderEvent, etc.)
5. **FILE** - File watch triggers for FTP/SFTP/S3 with glob patterns
6. **MESSAGE** - RabbitMQ/Redis message queue consumers

#### Pipeline Hooks (24 Stages)

**Step-Level Hooks** (18): BEFORE/AFTER for each step type
- BEFORE_EXTRACT, AFTER_EXTRACT
- BEFORE_TRANSFORM, AFTER_TRANSFORM
- BEFORE_VALIDATE, AFTER_VALIDATE
- BEFORE_ENRICH, AFTER_ENRICH
- BEFORE_ROUTE, AFTER_ROUTE
- BEFORE_LOAD, AFTER_LOAD
- BEFORE_EXPORT, AFTER_EXPORT
- BEFORE_FEED, AFTER_FEED
- BEFORE_SINK, AFTER_SINK

**Global Hooks** (6):
- ON_ERROR (error handling)
- ON_RETRY (retry logic)
- ON_DEAD_LETTER (failed record handling)
- PIPELINE_STARTED (initialization)
- PIPELINE_COMPLETED (cleanup)
- PIPELINE_FAILED (error recovery)

**Hook Actions**: INTERCEPTOR (modify records), SCRIPT (custom JS), WEBHOOK (HTTP call), EMIT (event), TRIGGER_PIPELINE (chain), LOG (audit)

#### Product Feeds (4 Built-in)
- **Google Shopping Feed** - Google Merchant Center XML
- **Meta Catalog Feed** - Facebook/Instagram product catalog
- **Amazon Seller Central** - Amazon product feed
- **Custom Feeds** - Configurable XML/JSON feeds

#### Search Sinks (7 Built-in)
- **Elasticsearch** - Full-text search indexing
- **MeiliSearch** - Instant search engine
- **Algolia** - Hosted search service
- **Typesense** - Open-source search engine
- **Queue Producer** - RabbitMQ/Redis Streams/SQS message publishing
- **Webhook** - HTTP POST to external services
- **PDF Generator** - Generate PDF documents from templates

### Advanced Features

#### Security
- **SSRF Protection**: URL validation blocking private IPs and cloud metadata endpoints
- **SQL Injection Prevention**: Parameterized queries and identifier escaping
- **Code Sandboxing**: Safe expression evaluator with 48+ blocked keywords
- **Secret Encryption**: AES-256-GCM encryption at rest for INLINE secrets (requires DATAHUB_MASTER_KEY)
- **Path Traversal Protection**: Secure file path handling
- **Webhook Authentication**: API key, HMAC-SHA256/512, Basic Auth, and JWT support
- **XSS Prevention**: React default escaping + sandboxed eval
- **Prototype Pollution Guards**: DANGEROUS_KEYS filtering in object operations

#### Horizontal Scaling
- **Distributed Locking**: Redis, PostgreSQL, and in-memory backends
  - Prevents duplicate scheduled trigger execution
  - Ensures single message queue consumer per pipeline
  - Prevents concurrent pipeline run conflicts
- **Rate Limiting**: Configurable rate limits with standard headers
- **Circuit Breaker**: Fault tolerance with automatic recovery (5 failure threshold, 3 success recovery)
- **Connection Pooling**: Min/max connections with idle timeout
- **Checkpoint Persistence**: Resume pipelines across instance restarts

#### Secret Management
- **Multiple Providers**:
  - `INLINE`: Database storage with optional AES-256-GCM encryption
  - `ENV`: Environment variable resolution with fallback syntax
- **Encryption Configuration**: Set `DATAHUB_MASTER_KEY` environment variable
- **Secret Generation**: `openssl rand -hex 32`
- **Dashboard Management**: Create, update, and test secrets via UI

### Visual Pipeline Builder

- **Drag-and-Drop Editor**: React Flow-based pipeline designer
- **Two Editor Modes**:
  - **Simple Mode**: Linear step-by-step pipeline creation
  - **Workflow Mode**: Complex DAG with branching and merging
- **Visual Features**:
  - Real-time validation with inline error indicators
  - Step configuration panels with schema-driven forms
  - Connection handles with type compatibility
  - Zoom, pan, and minimap navigation
  - Auto-layout with hierarchical node placement
  - Dark mode support

### Code-First DSL

Complete TypeScript DSL for programmatic pipeline definitions:

```typescript
import { createPipeline, DataHubPlugin } from '@oronts/vendure-data-hub-plugin';

const productSync = createPipeline()
  .name('Product Import')
  .description('Daily product sync from ERP')
  .trigger('SCHEDULE', { cronExpression: '0 2 * * *' })
  .extract('fetch-products', {
    adapterCode: 'httpApi',
    'connection.endpoint': 'https://erp.example.com/api/products',
    'connection.apiKeySecretCode': 'erp-api-key',
  })
  .transform('prepare', {
    operators: [
      { op: 'map', args: { mapping: { sku: 'itemNumber', name: 'productName' } } },
      { op: 'slugify', args: { source: 'name', target: 'slug' } },
      { op: 'toNumber', args: { source: 'price' } },
    ],
  })
  .load('upsert-products', {
    adapterCode: 'productUpsert',
    strategy: 'UPSERT',
    matchField: 'sku',
  })
  .edge('SCHEDULE', 'fetch-products')
  .edge('fetch-products', 'prepare')
  .edge('prepare', 'upsert-products')
  .build();

DataHubPlugin.init({
  pipelines: [productSync],
});
```

### Import & Export Wizards

**Guided Wizards**: Step-by-step pipeline creation without code
- **Import Wizard**: Source → Target → Mapping → Strategy → Trigger
- **Export Wizard**: Entity → Fields → Format → Destination → Trigger
- **Template System**: Pre-configured blueprints for common scenarios

**Built-in Import Templates** (6):
- REST API Product Sync (featured)
- JSON Product Import
- Magento Product Export CSV (featured)
- XML Product Feed Import
- ERP Inventory Sync (featured)
- CRM Customer Sync

**Built-in Export Templates** (8):
- Google Merchant Center Feed (featured)
- Meta (Facebook) Catalog Feed (featured)
- Amazon Product Feed
- Product Catalog CSV (featured)
- Product Catalog JSON
- Customer Export CSV
- Order Export CSV
- Inventory Report CSV

**Custom Templates**: Register your own templates via `DataHubPluginOptions.importTemplates` and `exportTemplates`

### Dashboard Features

- **Pipeline Management**: Create, edit, clone, archive, version pipelines
- **Run Monitoring**: Real-time run status, logs, and metrics with WebSocket subscriptions
- **Connection Manager**: Configure external service connections with test capability
- **Secret Manager**: Secure secret storage and rotation
- **Webhook Management**: Configure and test webhook endpoints
- **Queue Monitoring**: View queue depths, consumer status, and dead letter queues
- **Analytics Dashboard**: Pipeline execution metrics, trends, and performance data
- **Log Explorer**: Advanced log filtering, search, and export (7-column responsive grid)
- **Dark Mode**: Comprehensive dark mode with semantic Vendure colors
- **Responsive Design**: Mobile-first approach with responsive grids

### API

**GraphQL API** (18 resolvers):
- Pipeline CRUD operations
- Run execution and monitoring
- Connection management
- Secret management
- Analytics queries
- Webhook configuration
- Queue management
- Log queries

**REST API** (2 controllers):
- File upload endpoint (`/data-hub/upload`)
- Webhook trigger endpoints (`/data-hub/webhook/:code`)

**Permissions System** (27 permissions):
- Fine-grained access control for all operations
- Channel-scoped permissions for multi-tenant deployments

### SDK & Extensibility

**Registration Functions** (10):
```typescript
// Register custom adapters
registerExtractor(definition);
registerLoader(definition);
registerOperator(definition);
registerExporter(definition);
registerFeed(definition);
registerSink(definition);
registerValidator(definition);
registerEnricher(definition);
registerTransform(definition);
registerScript(name, function);
```

**Public API Exports**:
- All adapter interfaces (ExtractorAdapter, LoaderAdapter, etc.)
- SDK result types (OperatorResult, ValidationResult, etc.)
- Helper utilities (ValidationBuilder, EntityLookupHelper)
- Type definitions (416+ types exported)
- Event types and constants

### Event System

**Event Publishing** (22 event types):
- Pipeline lifecycle (Created, Updated, Published, Archived, Deleted)
- Run lifecycle (Started, Progress, Completed, Failed, Cancelled)
- Step lifecycle (Started, Completed, Failed)
- Gate events (ApprovalRequested, Approved, Rejected, Timeout)
- Trigger events (TriggerFired, ScheduleActivated, ScheduleDeactivated)
- Webhook delivery (Succeeded, Failed, Retrying, DeadLetter)
- Log events

**Event Subscriptions**:
- Subscribe to DataHub events in your Vendure plugins
- React to pipeline completions, failures, or data changes
- Build monitoring, alerting, and audit systems

### Gate Steps (Human-in-the-Loop)

- **MANUAL**: Require human approval before proceeding
- **THRESHOLD**: Auto-approve if conditions met, otherwise manual
- **TIMEOUT**: Auto-approve after delay, or manual before timeout
- **Use Cases**: Quality control, compliance review, financial approval

### Pimcore Connector

Pre-built integration for Pimcore PIM/DAM → Vendure sync:

**4 Import Templates**:
- Product Sync (with variants, pricing, assets)
- Category Sync (hierarchical collections)
- Asset Sync (DAM media import)
- Facet/Attribute Sync

**1 Export Template**:
- Product Export for Pimcore (JSON format)

**Features**:
- GraphQL DataHub extraction
- Delta sync (only changed records)
- Localization support
- Custom field mapping
- Webhook integration

### Developer Experience

- **TypeScript SDK**: Full type safety for pipeline definitions
- **Code-First Pipelines**: Define pipelines programmatically
- **Hook System**: 24 hook stages for customization
- **Custom Adapters**: Register custom extractors, operators, and loaders
- **Documentation**: Comprehensive user guides, developer guides, and API reference (45+ docs)
- **Examples**: Real-world pipeline examples in `/dev-server/examples`
- **Testing**: Dry run mode for testing pipelines before execution

### Configuration

**Plugin Options**:
- Runtime configuration (batch sizes, timeouts, rate limits)
- HTTP client settings (retries, exponential backoff)
- Circuit breaker configuration
- Connection pooling
- Pagination limits
- Scheduler intervals
- Data retention (runs: 30 days, errors: 90 days)

**Environment Variables**:
- `DATAHUB_MASTER_KEY` - Secret encryption key
- `DATAHUB_REDIS_URL` - Redis for distributed locks
- `DATAHUB_LOCK_BACKEND` - Force lock backend (`redis`, `postgres`, `memory`)
- `DATAHUB_MEILISEARCH_URL`, `DATAHUB_ELASTICSEARCH_URL`, `DATAHUB_TYPESENSE_URL` - Search service URLs

### Migration Notes

**From Pre-release to 0.1.0**:

1. **Database Migration**: Run Vendure migrations to create new tables
   ```bash
   npx vendure migrate
   ```

2. **Secret Encryption** (Optional but Recommended):
   - Generate master key: `openssl rand -hex 32`
   - Set `DATAHUB_MASTER_KEY` environment variable
   - Re-save existing INLINE secrets through the UI (auto-encrypted on save)

3. **Breaking Changes**: None - this is the initial release

---

## Support

- **Documentation**: See `/docs` folder
- **Examples**: See `/dev-server/examples` folder
- **Issues**: Report bugs and request features via GitHub issues
- **Production Deployment**: See `/docs/deployment/production.md`

---

## Security Notes

- **Secret Encryption**: INLINE secrets are encrypted at rest with AES-256-GCM when `DATAHUB_MASTER_KEY` is configured
- **Without Encryption**: INLINE secrets stored as plain text (warning logged at startup)
- **Recommended**: Use `ENV` provider for production secrets, or enable encryption with master key
- **SSRF Protection**: Active on all outbound HTTP requests (webhooks, extractors, API calls)
- **Code Sandboxing**: 48+ dangerous patterns blocked in custom script execution

---

## Known Limitations

- **Real-time Updates**: Dashboard uses polling intervals (3-10s) for updates.
- **File Upload Limits**: 100MB max file size, 10 files per upload, 24-hour expiry.

---

## Version History

- **0.1.0** (2026-02-24) - Initial production release

# Changelog

All notable changes to the Vendure Data Hub Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-30

### Added

#### Core Features
- **Pipeline DSL Builder**: Fluent TypeScript API for defining ETL pipelines
- **Visual Pipeline Editor**: React Flow-based drag-and-drop pipeline designer
- **Step Types**: EXTRACT, TRANSFORM, VALIDATE, ENRICH, ROUTE, LOAD, EXPORT, FEED, SINK
- **59 Built-in Operators**: Comprehensive data transformation operators
- **Adapter Registry**: Extensible adapter system for custom extractors, loaders, and operators

#### Enterprise Features
- **Distributed Locking**: Redis, PostgreSQL, and in-memory lock backends for horizontal scaling
- **Rate Limiting**: Configurable rate limits with standard headers
- **Circuit Breaker**: Fault tolerance with automatic recovery
- **Secret Management**: Secure secrets with multiple providers (inline, env, config)
- **Secret Encryption**: AES-256-GCM encryption at rest for INLINE secrets (requires DATAHUB_MASTER_KEY)

#### Security
- **SSRF Protection**: Comprehensive URL validation blocking private IPs and cloud metadata
- **SQL Injection Prevention**: Input validation and identifier escaping
- **Code Sandboxing**: Safe expression evaluator with whitelist-based validation
- **Path Traversal Protection**: Secure file path handling
- **Webhook Authentication**: API key, HMAC, Basic Auth, and JWT support

#### Integrations
- **Vendure Loaders**: Product, Variant, Customer, Collection, Facet, Asset, Order, Stock management
- **File Extractors**: CSV, JSON, XML with streaming support
- **API Extractors**: REST, GraphQL with pagination
- **Feed Generators**: Google Merchant, Meta Catalog, Amazon, custom feeds
- **Sink Adapters**: Elasticsearch, Meilisearch, Algolia, Typesense

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
- **Comprehensive Documentation**: User guides, developer guides, and API reference

### Security Notes
- Secrets stored with INLINE provider are encrypted at rest when DATAHUB_MASTER_KEY environment variable is configured
- Generate a master key: \`openssl rand -hex 32\`
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

## [Unreleased]

### Planned
- Additional audit logging for admin actions
- Key rotation utility for secret encryption
- Enhanced multi-tenancy documentation
- Additional test coverage

---

## Migration Notes

### From Pre-release to 0.1.0

If upgrading from a pre-release version:

1. **Database Migration**: Run Vendure migrations to create new tables
   \`\`\`bash
   npx vendure migrate
   \`\`\`

2. **Secret Encryption**: To enable encryption for existing secrets:
   - Set DATAHUB_MASTER_KEY environment variable
   - Re-save existing INLINE secrets through the UI (they will be encrypted on save)

3. **Breaking Changes**: None - this is the initial release

---

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/vendure-data-hub/issues)
- **Documentation**: See \`/docs\` folder
- **Examples**: See \`/dev-server/examples\` folder

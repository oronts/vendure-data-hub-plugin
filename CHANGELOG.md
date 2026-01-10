<p align="center">
  <a href="https://oronts.com">
    <img src="https://oronts.com/assets/images/logo/favicon.png" alt="Oronts" width="60" height="60">
  </a>
</p>

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive documentation in `/docs` folder
- Oronts branding and licensing information

### Changed
- Updated README with production-ready content
- Improved LICENSE with commercial licensing details

---

## [0.1.0] - 2025-01-06

### Added

#### Core Features
- Visual pipeline builder with drag-and-drop interface
- Code-first DSL for programmatic pipeline definition
- Pipeline scheduling (cron expressions and interval-based)
- Checkpointing for resumable pipelines
- Dry run simulation mode
- Step-level testing interface
- Multi-language support for product data
- Publish workflow with version control
- Comprehensive Admin UI dashboard

#### Extractors (7 types)
- **HTTP API** - REST API with pagination support
- **Database** - PostgreSQL, MySQL, MSSQL, SQLite
- **S3** - Amazon S3 and compatible storage
- **FTP/SFTP** - File server downloads
- **Webhook** - Real-time incoming data
- **File** - CSV, JSON, XML, Excel parsing
- **Vendure Query** - Internal GraphQL queries

#### Entity Loaders (14 types)
- Product and ProductVariant
- Customer and CustomerGroup
- Order (notes, transitions, coupons)
- Collection
- Facet and FacetValue
- Asset
- Promotion
- ShippingMethod
- StockLocation and Inventory
- TaxRate, PaymentMethod, Channel

#### Transform Operators (45+)
- **String** - trim, uppercase, lowercase, slugify, split, join, replace, regex, stripHtml, truncate
- **Numeric** - math, toNumber, toString, currency, unit, parseNumber, formatNumber, toCents, round
- **Date** - parse, format, add, diff
- **Logic** - when, if-then-else, switch, delta-filter
- **JSON** - get, flatten, merge, parse, stringify
- **Validation** - required, type, range, pattern, length
- **Data** - set, copy, rename, remove, map, template

#### Product Feeds (4 types)
- **Google Merchant Center** - XML/TSV format
- **Meta Catalog** - Facebook/Instagram CSV/XML
- **Amazon** - Product/Inventory/Pricing feeds
- **Custom** - Flexible field mapping with templates

#### Search Sinks (4 types)
- **Elasticsearch** - Full-text search indexing
- **MeiliSearch** - Typo-tolerant search
- **Algolia** - Hosted search service
- **Typesense** - Open-source search engine

#### Infrastructure
- Secret management for credentials
- Connection management for external services
- Analytics dashboard with metrics
- Real-time monitoring and logs
- Error tracking and quarantine
- Custom permissions system

---

## License

This plugin is developed and maintained by [Oronts](https://oronts.com).

- **Non-commercial use**: Free for personal, educational, and evaluation purposes
- **Commercial use**: Requires a paid license

Contact **office@oronts.com** for commercial licensing.

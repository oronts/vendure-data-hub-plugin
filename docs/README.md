<p align="center">
  <a href="https://oronts.com">
    <img src="https://oronts.com/_next/image?url=%2Fimages%2Flogo%2FLogo-white.png&w=256&q=75" alt="Oronts" width="60" height="60">
  </a>
</p>

<h1 align="center">Data Hub Plugin Documentation</h1>

<p align="center">
  <strong>Enterprise ETL & Data Integration for Vendure E-commerce</strong>
</p>

---

Welcome to the Data Hub Plugin documentation. This plugin provides ETL (Extract, Transform, Load) capabilities for Vendure e-commerce.

## Visual Overview

<p align="center">
  <img src="images/08-pipeline-editor-workflow.png" alt="Visual Pipeline Editor" width="700">
  <br>
  <em>Visual Pipeline Editor - Build data pipelines with drag-and-drop</em>
</p>

## Documentation Sections

### [Getting Started](./getting-started/README.md)
New to Data Hub? Start here for installation, basic setup, and your first pipeline.

- [Installation](./getting-started/installation.md)
- [Quick Start](./getting-started/quick-start.md)
- [Core Concepts](./getting-started/concepts.md)

### [User Guide](./user-guide/README.md)
Learn how to use the Data Hub Admin UI to create and manage pipelines.

- [Creating Pipelines](./user-guide/pipelines.md)
- [Import/Export Wizards](./user-guide/wizards.md) - Step-by-step wizard guides
- [Advanced Recipes](./user-guide/recipes.md) - Real-world pipeline examples
- [Managing Connections](./user-guide/connections.md)
- [Secrets Management](./user-guide/secrets.md)
- [Scheduling Pipelines](./user-guide/scheduling.md)
- [Monitoring & Logs](./user-guide/monitoring.md)
- [Product Feeds](./user-guide/feeds.md)
- [Queue & Messaging](./user-guide/queue-messaging.md)
- [External Integrations](./user-guide/external-integrations.md)

### [Developer Guide](./developer-guide/README.md)
For developers who want to use the code-first DSL or extend the plugin.

- [Architecture Overview](./developer-guide/architecture.md)
- [DSL Reference](./developer-guide/dsl/README.md)
  - [Pipeline Builder](./developer-guide/dsl/pipeline-builder.md)
  - [Schema Reference](./developer-guide/dsl/schema-reference.md) - Complete TypeScript interface reference
  - [Operators](./developer-guide/dsl/operators.md)
  - [Examples](./developer-guide/dsl/examples.md)
- [Testing Guide](./developer-guide/testing.md) - Unit, integration, and E2E testing
- [Extending the Plugin](./developer-guide/extending/README.md)
  - [Custom Extractors](./developer-guide/extending/custom-extractors.md)
  - [Custom Loaders](./developer-guide/extending/custom-loaders.md)
  - [Custom Operators](./developer-guide/extending/custom-operators.md)
  - [Custom Feeds](./developer-guide/extending/custom-feeds.md)
  - [Custom Sinks](./developer-guide/extending/custom-sinks.md)
  - [Custom Triggers](./developer-guide/extending/custom-triggers.md)
  - [Hook Scripts](./developer-guide/extending/README.md#hook-script-registration)
  - [Wizard Templates](./developer-guide/extending/README.md#template-registration)
- [GraphQL API](./developer-guide/graphql-api.md)

### [Deployment](./deployment/README.md)
Production deployment and configuration guidance.

- [Configuration Options](./deployment/configuration.md)
- [Permissions](./deployment/permissions.md)
- [Production Setup](./deployment/production.md)
- [Performance Tuning](./deployment/performance.md) - Optimization strategies
- [Migrations](./deployment/migrations.md) - Version upgrade guide
- [Troubleshooting](./deployment/troubleshooting.md)

### [Reference](./reference/README.md)
Complete reference documentation for all adapters and operators.

- [Extractors](./reference/extractors.md)
- [Loaders](./reference/loaders.md)
- [Operators](./reference/operators.md)
- [Feed Generators](./reference/feeds.md)
- [Search Sinks](./reference/sinks.md)

## Quick Links

| Task | Documentation |
|------|---------------|
| Install the plugin | [Installation](./getting-started/installation.md) |
| Create your first pipeline | [Quick Start](./getting-started/quick-start.md) |
| Import products from API | [REST API Extractor](./reference/extractors.md#rest-api-extractor) |
| Use import/export wizards | [Wizards Guide](./user-guide/wizards.md) |
| Real-world pipeline examples | [Advanced Recipes](./user-guide/recipes.md) |
| Sync to search engine | [Search Sinks](./reference/sinks.md) |
| Generate Google feed | [Product Feeds](./user-guide/feeds.md) |
| Use code-first DSL | [Pipeline Builder](./developer-guide/dsl/pipeline-builder.md) |
| DSL type reference | [Schema Reference](./developer-guide/dsl/schema-reference.md) |
| Test your pipelines | [Testing Guide](./developer-guide/testing.md) |
| Create custom extractor | [Custom Extractors](./developer-guide/extending/custom-extractors.md) |
| Register pipeline hooks | [Configuration](./deployment/configuration.md#scripts) |
| Add custom templates | [Extending](./developer-guide/extending/README.md#template-registration) |
| Optimize performance | [Performance Tuning](./deployment/performance.md) |
| Upgrade between versions | [Migrations](./deployment/migrations.md) |
| Debug pipeline issues | [Troubleshooting](./deployment/troubleshooting.md) |

---

## License

**This is a commercial plugin.**

**Free for non-commercial use:** Personal projects, education, evaluation, and open-source projects.

**Commercial license required** for business use, revenue-generating stores, client projects, and enterprise deployments.

Contact **office@oronts.com** for commercial licensing.

---

## Support & Consulting

<p align="center">
  <a href="https://oronts.com">
    <img src="https://oronts.com/_next/image?url=%2Fimages%2Flogo%2FLogo-white.png&w=256&q=75" alt="Oronts" width="40" height="40">
  </a>
</p>

Need help with Data Hub, Vendure, or e-commerce solutions?

**Oronts** provides:
- Data Hub customization and integrations
- Full-stack Vendure development
- E-commerce platform development
- AI-powered automation solutions

**Contact us:**
- Website: [https://oronts.com](https://oronts.com)
- Email: **office@oronts.com**

*Custom software development, e-commerce integrations, and data automation services.*

# User Guide

This guide covers using the Data Hub Admin UI to create and manage data pipelines.

<p align="center">
  <img src="../images/08-pipeline-editor-workflow.png" alt="Visual Pipeline Editor" width="700">
  <br>
  <em>Visual Pipeline Editor - Drag-and-drop interface for building data pipelines</em>
</p>

## Contents

1. [Creating Pipelines](./pipelines.md) - Build and edit pipelines with the visual editor
2. [Import/Export Wizards](./wizards.md) - Step-by-step guide to data import and export wizards
3. [Advanced Recipes](./recipes.md) - Real-world pipeline examples and patterns
4. [Managing Connections](./connections.md) - Set up database and API connections
5. [Secrets Management](./secrets.md) - Store API keys and credentials securely
6. [Scheduling Pipelines](./scheduling.md) - Automate pipeline execution
7. [Monitoring & Logs](./monitoring.md) - Track runs and debug issues
8. [Product Feeds](./feeds.md) - Generate feeds for Google, Meta, and more
9. [Queue & Messaging](./queue-messaging.md) - Consume from and produce to message queues
10. [External Integrations](./external-integrations.md) - Search engines, webhooks, and external APIs
11. [Schema Registry](./schemas.md) - Version and bind input/validation contracts

## Accessing Data Hub

1. Log in to the Vendure Admin UI
2. Click **Data Hub** in the left navigation menu
3. Open **Pipelines** to create, edit, run, and inspect pipelines

## Dashboard Overview

Data Hub does not currently have a separate overview or upcoming-schedules
page. Operational information is distributed across pipeline details,
**Queues**, and **Logs & Analytics**.

## Navigation

| Section | Purpose |
|---------|---------|
| Pipelines | Create, edit, publish, run, and inspect per-pipeline run history |
| Connections | Manage external system connections |
| Secrets | Store sensitive credentials |
| Adapters | Inspect registered runtime capabilities and schemas |
| Schemas | Manage immutable, versioned record contracts and inspect pipeline impact |
| Queues | View queue aggregates, dead letters, recent failures, and message consumers |
| Hooks | Inspect hooks and the process-local recent-event buffer |
| Logs & Analytics | Search persisted logs, view log statistics, and follow the polling log feed |
| Settings | Configure plugin options |

Record errors are available from run details and the Queues dead-letter tab;
there is no standalone Errors route.

## Required Permissions

To use Data Hub, your admin role needs these permissions:

| Action | Permission Required |
|--------|---------------------|
| View pipelines | `ReadDataHubPipeline` |
| Create/edit pipelines | `CreateDataHubPipeline`, `UpdateDataHubPipeline` |
| Run pipelines | `RunDataHubPipeline` |
| View run history | `ViewDataHubRuns` |
| Manage connections | `ManageDataHubConnections` |
| Manage secrets | `CreateDataHubSecret`, `ReadDataHubSecret`, `UpdateDataHubSecret`, `DeleteDataHubSecret` |
| Run pipelines that reference connections or secrets | `UseDataHubConnection`, `UseDataHubSecret` as required by the definition |
| View/retry quarantined records unchanged | `ViewDataHubQuarantine`, `ReplayDataHubRecord` |
| Retry quarantined records with a payload patch | `ViewDataHubQuarantine`, `ReplayDataHubRecord`, `EditDataHubQuarantine` |
| Configure settings | `UpdateDataHubSettings` |
| View schema versions | `ReadDataHubSchema` |
| Create schema versions | `CreateDataHubSchema` |
| Edit schema metadata | `UpdateDataHubSchema` |
| Delete unused schema versions | `DeleteDataHubSchema` |

Ask your administrator to assign these permissions if you don't have access.

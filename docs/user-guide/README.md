# User Guide

This guide covers using the Data Hub Admin UI to create and manage data pipelines.

<p align="center">
  <img src="../images/08-pipeline-editor-workflow.png" alt="Visual Pipeline Editor" width="700">
  <br>
  <em>Visual Pipeline Editor - Drag-and-drop interface for building data pipelines</em>
</p>

## Contents

1. [Creating Pipelines](./pipelines.md) - Build and edit pipelines with the visual editor
2. [Managing Connections](./connections.md) - Set up database and API connections
3. [Secrets Management](./secrets.md) - Store API keys and credentials securely
4. [Scheduling Pipelines](./scheduling.md) - Automate pipeline execution
5. [Monitoring & Logs](./monitoring.md) - Track runs and debug issues
6. [Product Feeds](./feeds.md) - Generate feeds for Google, Meta, and more
7. [Queue & Messaging](./queue-messaging.md) - Consume from and produce to message queues
8. [External Integrations](./external-integrations.md) - Search engines, webhooks, and external APIs

## Accessing Data Hub

1. Log in to the Vendure Admin UI
2. Click **Data Hub** in the left navigation menu
3. You'll see the main dashboard with pipeline overview

## Dashboard Overview

The Data Hub dashboard shows:

- **Active Pipelines** - Pipelines currently enabled
- **Recent Runs** - Latest pipeline executions
- **Failed Records** - Records requiring attention
- **Upcoming Schedules** - Next scheduled runs

## Navigation

| Section | Purpose |
|---------|---------|
| Pipelines | Create, edit, run pipelines |
| Runs | View execution history and logs |
| Connections | Manage external system connections |
| Secrets | Store sensitive credentials |
| Errors | Review and retry failed records |
| Analytics | View performance metrics |
| Settings | Configure plugin options |

## Required Permissions

To use Data Hub, your admin role needs these permissions:

| Action | Permission Required |
|--------|---------------------|
| View pipelines | `ReadDataHubPipeline` |
| Create/edit pipelines | `CreateDataHubPipeline`, `UpdateDataHubPipeline` |
| Run pipelines | `RunDataHubPipeline` |
| View run history | `ViewDataHubRuns` |
| Manage connections | `ManageDataHubConnections` |
| Manage secrets | `CreateDataHubSecret`, `ReadDataHubSecret` |
| Configure settings | `UpdateDataHubSettings` |

Ask your administrator to assign these permissions if you don't have access.

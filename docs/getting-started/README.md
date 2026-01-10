# Getting Started

This section covers everything you need to get the Data Hub plugin running in your Vendure project.

## Contents

1. [Installation](./installation.md) - Add the plugin to your Vendure project
2. [Quick Start](./quick-start.md) - Create your first pipeline in 5 minutes
3. [Core Concepts](./concepts.md) - Understand pipelines, steps, and data flow

## Prerequisites

- Vendure ^3.0.0
- Node.js >=18.0.0
- A running Vendure server with Admin UI

## Overview

The Data Hub plugin adds ETL (Extract, Transform, Load) capabilities to Vendure:

1. **Extract** - Pull data from external sources (APIs, databases, files)
2. **Transform** - Clean, validate, and map data to Vendure formats
3. **Load** - Create or update Vendure entities (products, customers, etc.)

You can build pipelines using either:
- **Visual Builder** - Drag-and-drop interface in the Admin UI
- **Code-First DSL** - TypeScript API for defining pipelines in code

## Next Steps

Start with [Installation](./installation.md) to add the plugin to your project.

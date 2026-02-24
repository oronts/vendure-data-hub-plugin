# Migration Guide

Guide for upgrading Data Hub and migrating pipelines between versions.

## Table of Contents

- [Overview](#overview)
- [Version Compatibility](#version-compatibility)
- [Pre-Migration Checklist](#pre-migration-checklist)
- [Migration Procedures](#migration-procedures)
- [Breaking Changes by Version](#breaking-changes-by-version)
- [Database Migrations](#database-migrations)
- [Pipeline Migrations](#pipeline-migrations)
- [Rollback Procedures](#rollback-procedures)
- [Post-Migration Validation](#post-migration-validation)

## Overview

Data Hub follows semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes requiring migration
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, fully compatible

### Migration Types

| Type | Description | Downtime | Complexity |
|------|-------------|----------|------------|
| **Patch** | Bug fixes only | None | Low |
| **Minor** | New features, backward compatible | None | Low |
| **Major** | Breaking changes | Possible | Medium-High |

## Version Compatibility

### Vendure Version Requirements

| Data Hub Version | Minimum Vendure | Recommended Vendure |
|------------------|-----------------|---------------------|
| 2.0.x | 2.0.0 | 2.2.x |
| 1.5.x | 1.9.0 | 2.1.x |
| 1.0.x | 1.8.0 | 1.9.x |

### Node.js Requirements

| Data Hub Version | Node.js |
|------------------|---------|
| 2.x | >= 18.0.0 |
| 1.x | >= 16.0.0 |

### Database Requirements

- **PostgreSQL**: >= 12.0
- **MySQL**: >= 8.0 (limited support)

## Pre-Migration Checklist

Before upgrading, complete these steps:

### 1. Backup Everything

```bash
# Backup database
pg_dump vendure_db > backup-$(date +%Y%m%d).sql

# Backup pipeline definitions (if using file-based config)
tar -czf pipeline-backup-$(date +%Y%m%d).tar.gz ./pipelines

# Backup plugin configuration
cp vendure-config.ts vendure-config.ts.backup
```

### 2. Review Release Notes

Read the [CHANGELOG.md](../../CHANGELOG.md) for:
- Breaking changes
- Deprecated features
- New features
- Migration notes

### 3. Test in Staging

```bash
# Clone production data to staging
pg_dump production_db | psql staging_db

# Test upgrade in staging first
cd staging-environment
npm install @oronts/vendure-data-hub-plugin@latest
npm run dev
```

### 4. Check Dependencies

```bash
# List installed version
npm list @oronts/vendure-data-hub-plugin

# Check for peer dependency conflicts
npm ls
```

### 5. Review Custom Code

- Custom adapters
- Custom operators
- Hook scripts
- Template pipelines

Check for compatibility with new version.

## Migration Procedures

### Patch Version Upgrade (1.0.1 → 1.0.2)

**No migration needed.** Simply update the package:

```bash
npm install @oronts/vendure-data-hub-plugin@latest
npm run build
pm2 restart vendure
```

### Minor Version Upgrade (1.0.x → 1.1.0)

**Backward compatible.** Update package and optionally adopt new features:

```bash
# Update package
npm install @oronts/vendure-data-hub-plugin@latest

# Run database migrations (if any)
npm run migration:run

# Restart server
pm2 restart vendure
```

### Major Version Upgrade (1.x → 2.0)

**Breaking changes.** Follow detailed migration guide:

1. **Read Breaking Changes**

   Review breaking changes for your version in [Breaking Changes](#breaking-changes-by-version).

2. **Update Package**

   ```bash
   npm install @oronts/vendure-data-hub-plugin@2.0.0
   ```

3. **Run Migration Script**

   ```bash
   npx data-hub-migrate --from=1.x --to=2.0
   ```

4. **Update Configuration**

   Update `vendure-config.ts` for new plugin options.

5. **Migrate Pipelines**

   Use migration tool to update pipeline definitions:

   ```bash
   npx data-hub-migrate-pipelines \
     --input=./pipelines \
     --output=./pipelines-v2 \
     --from=1.x \
     --to=2.0
   ```

6. **Run Database Migrations**

   ```bash
   npm run migration:run
   ```

7. **Test Thoroughly**

   Run all pipelines in dry-run mode:

   ```graphql
   mutation {
     runDataHubPipeline(id: "pipeline-1", dryRun: true) {
       id
       status
     }
   }
   ```

8. **Deploy**

   ```bash
   npm run build
   pm2 restart vendure
   ```

## Breaking Changes by Version

### Version 2.0.0 (Current)

**Release Date:** 2024-01-15

#### Breaking Changes

1. **Pipeline Definition Schema**

   **Before (1.x):**
   ```typescript
   {
     version: 1,
     steps: [{
       type: 'extract',
       adapter: 'httpApi',  // ❌ Old field
       config: {}
     }]
   }
   ```

   **After (2.x):**
   ```typescript
   {
     version: 1,
     steps: [{
       type: 'EXTRACT',      // ✅ Uppercase
       config: {
         adapterCode: 'httpApi',  // ✅ New field
       }
     }]
   }
   ```

   **Migration:**
   - Rename `adapter` → `adapterCode` in all steps
   - Change step types to SCREAMING_SNAKE_CASE

2. **Hook Stages**

   **Before (1.x):**
   ```typescript
   hooks: {
     beforeExtract: [],  // ❌ camelCase
   }
   ```

   **After (2.x):**
   ```typescript
   hooks: {
     BEFORE_EXTRACT: [],  // ✅ SCREAMING_SNAKE_CASE
   }
   ```

   **Migration:**
   - Convert all hook stage names to SCREAMING_SNAKE_CASE

3. **Operator Config**

   **Before (1.x):**
   ```typescript
   operators: [{
     type: 'rename',
     from: 'old',
     to: 'new'
   }]
   ```

   **After (2.x):**
   ```typescript
   operators: [{
     op: 'rename',          // ✅ 'op' instead of 'type'
     args: {                // ✅ 'args' wrapper
       from: 'old',
       to: 'new'
     }
   }]
   ```

   **Migration:**
   - Rename `type` → `op`
   - Wrap operator params in `args` object

4. **Connection Schema**

   **Before (1.x):**
   ```typescript
   connectionType: 'http'  // ❌ Lowercase
   ```

   **After (2.x):**
   ```typescript
   type: 'HTTP'  // ✅ Uppercase
   ```

5. **Removed Features**

   - `JobQueue` system removed (use Pipelines instead)
   - `legacyMode` option removed
   - `syncMode` replaced with `runMode`

### Version 1.5.0

**Release Date:** 2023-09-01

#### Breaking Changes

1. **GraphQL Schema**

   - `pipelineRuns` → `dataHubPipelineRuns`
   - `pipelines` → `dataHubPipelines`

2. **Permissions**

   New permission structure:
   ```typescript
   // Old
   'ReadPipeline'

   // New
   'ReadDataHubPipeline'
   ```

### Version 1.0.0

**Release Date:** 2023-03-15

Initial release.

## Database Migrations

### Automatic Migrations

Data Hub uses TypeORM migrations. Run after upgrading:

```bash
npm run migration:run
```

### Manual Migrations

For complex upgrades, run migrations manually:

```bash
# Generate migration
npm run migration:generate -- -n MigrationName

# Review generated migration
cat src/migrations/[timestamp]-MigrationName.ts

# Run migration
npm run migration:run

# Revert if needed
npm run migration:revert
```

### Migration Status

Check current migration status:

```bash
npm run migration:show
```

## Pipeline Migrations

### Automated Pipeline Migration

Use the migration tool to update pipeline definitions:

```bash
npx data-hub-migrate-pipelines \
  --from=1.5.0 \
  --to=2.0.0 \
  --input=./pipelines \
  --output=./pipelines-migrated \
  --backup
```

Options:
- `--from`: Source version
- `--to`: Target version
- `--input`: Input directory
- `--output`: Output directory
- `--backup`: Create backup before migration
- `--dry-run`: Preview changes without writing

### Manual Pipeline Migration

For custom pipelines, manually update:

1. **Update Step Types**

   ```typescript
   // Before
   type: 'extract'

   // After
   type: 'EXTRACT'
   ```

2. **Update Adapter References**

   ```typescript
   // Before
   adapter: 'httpApi'

   // After
   config: {
     adapterCode: 'httpApi'
   }
   ```

3. **Update Operators**

   ```typescript
   // Before
   operators: [{
     type: 'rename',
     from: 'old',
     to: 'new'
   }]

   // After
   operators: [{
     op: 'rename',
     args: { from: 'old', to: 'new' }
   }]
   ```

4. **Update Hooks**

   ```typescript
   // Before
   hooks: {
     beforeExtract: []
   }

   // After
   hooks: {
     BEFORE_EXTRACT: []
   }
   ```

### Validating Migrated Pipelines

```typescript
import { validatePipelineDefinition } from '@oronts/vendure-data-hub-plugin';

const pipeline = /* ... migrated pipeline ... */;
const result = validatePipelineDefinition(pipeline);

if (!result.valid) {
    console.error('Validation errors:', result.errors);
}
```

## Rollback Procedures

If migration fails, rollback to previous version:

### 1. Stop Server

```bash
pm2 stop vendure
```

### 2. Restore Database

```bash
psql vendure_db < backup-YYYYMMDD.sql
```

### 3. Revert Package Version

```bash
npm install @oronts/vendure-data-hub-plugin@1.5.0
```

### 4. Revert Configuration

```bash
cp vendure-config.ts.backup vendure-config.ts
```

### 5. Restart Server

```bash
npm run build
pm2 start vendure
```

### 6. Verify

```bash
curl http://localhost:3000/health
```

## Post-Migration Validation

After successful migration, validate:

### 1. Plugin Load

```bash
# Check server logs
pm2 logs vendure | grep "DataHubPlugin"
```

Expected output:
```
DataHubPlugin initialized successfully
```

### 2. GraphQL Schema

```graphql
query {
  __type(name: "DataHubPipeline") {
    fields {
      name
      type {
        name
      }
    }
  }
}
```

### 3. Database Schema

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE 'data_hub%';
```

### 4. Pipeline Execution

Run each pipeline in dry-run mode:

```graphql
mutation {
  runDataHubPipeline(id: "test-pipeline", dryRun: true) {
    id
    status
    recordsProcessed
  }
}
```

### 5. Custom Adapters

Test custom adapters:

```typescript
// test-custom-adapters.ts
import { myCustomExtractor } from './custom-adapters';

const context = createMockContext();
const config = { /* ... */ };

// Test extraction
const records = [];
for await (const record of myCustomExtractor.extract(context, config)) {
    records.push(record);
}

console.log(`Extracted ${records.length} records`);
```

### 6. Performance

Monitor performance metrics after migration:

```graphql
query {
  dataHubPipelinePerformance(
    pipelineId: "test-pipeline"
    timeRange: {
      from: "2024-01-01T00:00:00Z"
      to: "2024-01-31T23:59:59Z"
    }
  ) {
    avgDurationMs
    p95DurationMs
    successRate
  }
}
```

## Migration Troubleshooting

### Common Issues

#### Issue: Migration fails with "column does not exist"

**Solution:**
```bash
# Check migration status
npm run migration:show

# Manually run missing migrations
npm run migration:run
```

#### Issue: Pipeline validation errors after migration

**Solution:**
```bash
# Use migration tool
npx data-hub-migrate-pipelines \
  --from=1.5.0 \
  --to=2.0.0 \
  --input=./pipelines \
  --output=./pipelines-v2
```

#### Issue: Custom adapters not loading

**Solution:**
Check adapter registration:
```typescript
// vendure-config.ts
DataHubPlugin.init({
    adapters: [
        myCustomExtractor,  // ✅ Registered
    ],
})
```

#### Issue: Performance degradation

**Solution:**
1. Check indexes:
   ```sql
   SELECT * FROM pg_indexes
   WHERE tablename LIKE 'data_hub%';
   ```

2. Rebuild statistics:
   ```sql
   ANALYZE data_hub_pipeline_run;
   ANALYZE data_hub_pipeline_log;
   ```

3. Vacuum database:
   ```sql
   VACUUM ANALYZE;
   ```

## Zero-Downtime Migration

For production systems requiring zero downtime:

### Strategy: Blue-Green Deployment

1. **Setup Green Environment**

   ```bash
   # Clone current environment
   docker-compose -f docker-compose.green.yml up -d
   ```

2. **Run Migrations on Green**

   ```bash
   # Connect to green database
   export DATABASE_URL=postgresql://green-db

   # Run migrations
   npm run migration:run

   # Deploy new version
   npm run build
   pm2 start ecosystem.config.green.js
   ```

3. **Test Green Environment**

   ```bash
   curl http://green.example.com/health
   ```

4. **Switch Traffic**

   ```nginx
   # nginx.conf
   upstream vendure {
       server green.example.com:3000;  # Point to green
   }
   ```

5. **Monitor**

   Watch metrics for 24 hours before decommissioning blue.

### Strategy: Rolling Update

For Kubernetes deployments:

```yaml
# deployment.yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
      - name: vendure
        image: vendure:2.0.0  # New version
```

## See Also

- [Configuration Guide](./configuration.md) - Plugin configuration
- [Troubleshooting Guide](./troubleshooting.md) - Common issues
- [Performance Tuning](./performance.md) - Optimization
- [CHANGELOG](../../CHANGELOG.md) - Version history

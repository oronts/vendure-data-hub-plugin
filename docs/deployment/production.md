# Production Setup

Best practices for deploying Data Hub in production.

## Pre-Deployment Checklist

### Configuration

- [ ] Debug mode disabled (`debug: false`)
- [ ] Appropriate retention settings configured
- [ ] All secrets using environment variables (not inline)
- [ ] Connections configured for production systems
- [ ] External config file secured (if used)

### Security

- [ ] Permissions assigned to appropriate roles
- [ ] Secrets stored securely
- [ ] Webhook signatures enabled
- [ ] Database user has minimum required privileges

### Infrastructure

- [ ] Job queue workers configured
- [ ] Database indexes verified
- [ ] Log aggregation set up
- [ ] Monitoring and alerting configured

## Environment Variables

Use environment variables for all sensitive configuration:

```bash
# Database connections
ERP_DB_HOST=db.production.internal
ERP_DB_USER=vendure_reader
ERP_DB_PASSWORD=secure-password

# API keys
SUPPLIER_API_KEY=sk_live_...
GOOGLE_MERCHANT_API_KEY=...

# AWS credentials (for S3)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

## Plugin Configuration

```typescript
DataHubPlugin.init({
    enabled: true,
    debug: false,
    retentionDaysRuns: 30,
    retentionDaysErrors: 90,

    secrets: [
        { code: 'supplier-api', provider: 'env', value: 'SUPPLIER_API_KEY' },
        { code: 'erp-db-password', provider: 'env', value: 'ERP_DB_PASSWORD' },
    ],

    connections: [
        {
            code: 'erp-db',
            type: 'postgres',
            name: 'ERP Database',
            settings: {
                host: '${ERP_DB_HOST}',
                port: 5432,
                database: 'erp',
                username: '${ERP_DB_USER}',
                password: '${ERP_DB_PASSWORD}',
                ssl: true,
                poolSize: 5,
            },
        },
    ],
})
```

## Job Queue Setup

### Single Server

For smaller deployments, the default configuration works:

```typescript
jobQueueOptions: {
    activeQueues: ['default', 'data-hub-run', 'data-hub-schedule'],
}
```

### Multiple Workers

For high-volume processing, run dedicated workers:

```typescript
// Main server - handles API requests
jobQueueOptions: {
    activeQueues: ['default'],
}

// Worker process - handles data hub jobs
jobQueueOptions: {
    activeQueues: ['data-hub-run', 'data-hub-schedule'],
}
```

### Worker Script

```typescript
// worker.ts
import { bootstrapWorker } from '@vendure/core';
import config from './vendure-config';

bootstrapWorker({
    ...config,
    jobQueueOptions: {
        activeQueues: ['data-hub-run', 'data-hub-schedule'],
        pollInterval: 1000,
    },
})
    .then(worker => worker.startJobQueue())
    .catch(err => {
        console.error('Worker failed to start:', err);
        process.exit(1);
    });
```

## Database Considerations

### Connection Pooling

Limit connection pool size to prevent exhausting database connections:

```typescript
connections: [
    {
        code: 'external-db',
        type: 'postgres',
        settings: {
            poolSize: 5,  // Limit concurrent connections
        },
    },
]
```

### Read Replicas

For read-heavy operations, configure read replicas:

```typescript
connections: [
    {
        code: 'erp-db-read',
        type: 'postgres',
        settings: {
            host: '${ERP_DB_READ_HOST}',  // Read replica
        },
    },
]
```

## Logging

### Log Persistence Level

Set the minimum level to persist:

```graphql
mutation {
    setDataHubSettings(input: {
        logPersistenceLevel: "info"  # debug, info, warn, error
    }) {
        logPersistenceLevel
    }
}
```

- `debug` - All logs (high storage)
- `info` - Info and above (recommended)
- `warn` - Warnings and errors
- `error` - Errors only

### Log Aggregation

Send logs to external systems:

```typescript
// Custom log handler (example)
import { LoggingService } from '@vendure/core';

class CustomLogger extends LoggingService {
    log(level: string, message: string, context?: any) {
        // Send to CloudWatch, Datadog, etc.
        externalLogger.log({ level, message, context });
    }
}
```

## Monitoring

### Key Metrics

Monitor these metrics:

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Pipeline success rate | % of successful runs | < 95% |
| Average run duration | Execution time | > baseline + 50% |
| Record error rate | % of failed records | > 5% |
| Queue depth | Pending jobs | > 100 |
| Worker health | Active workers | < expected |

### Health Checks

Add health check endpoints:

```typescript
// Check Data Hub status
app.use('/health/data-hub', async (req, res) => {
    const isHealthy = await checkDataHubHealth();
    res.status(isHealthy ? 200 : 503).json({ healthy: isHealthy });
});
```

### Alerting

Set up alerts for:

- Pipeline failures
- High error rates
- Long-running pipelines
- Job queue backlog
- Worker crashes

## Backup and Recovery

### Data to Backup

- Pipeline definitions (if not code-first)
- Connection configurations
- Secret metadata (not values)
- Run history (optional)

### Recovery Procedures

1. **Code-first pipelines**: Automatically restored from code
2. **UI-created pipelines**: Restore from database backup
3. **Secrets**: Recreate from secure storage
4. **Connections**: Recreate from documentation

## Scaling

### Horizontal Scaling

Data Hub supports running multiple instances with automatic coordination:

**Distributed Locking:**

```bash
# Option 1: Redis (recommended for production)
DATAHUB_REDIS_URL=redis://redis.production.internal:6379

# Option 2: Force PostgreSQL (no additional infrastructure)
DATAHUB_LOCK_BACKEND=postgres
```

**What's Protected:**
- **Scheduled Triggers** - Only one instance executes each schedule
- **Message Consumers** - Only one instance consumes from each queue/pipeline combination
- **Pipeline Runs** - Prevents duplicate execution of the same run

**Deployment Architecture:**

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Vendure 1   │    │   Vendure 2   │    │   Vendure 3   │
│ + Data Hub    │    │ + Data Hub    │    │ + Data Hub    │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   PostgreSQL  │    │     Redis     │    │  Message Queue│
│   (required)  │    │   (optional)  │    │   (optional)  │
└───────────────┘    └───────────────┘    └───────────────┘
```

**Without Redis:**
- Distributed locks use PostgreSQL (works but slightly slower)
- All features remain functional
- Suitable for smaller deployments (2-5 instances)

**With Redis:**
- Faster lock acquisition/release
- Better for high-throughput scenarios
- Recommended for 5+ instances

### Additional Scaling Tips

- Run multiple API servers behind load balancer
- Run multiple worker processes for job queue
- Use read replicas for heavy read operations

### Vertical Scaling

- Increase batch sizes for high-volume pipelines
- Increase concurrency for parallel processing
- Tune database connection pools

### Rate Limiting

Protect external APIs:

```typescript
.extract('api-call', {
    throughput: {
        rateLimitRps: 10,  // Max 10 requests per second
    },
})
```

## Security Best Practices

1. **Secrets**: Always use environment variables in production
2. **Connections**: Use SSL/TLS for database connections
3. **Webhooks**: Enable signature verification
4. **Permissions**: Follow principle of least privilege
5. **Logging**: Never log sensitive data
6. **Network**: Restrict access to internal APIs

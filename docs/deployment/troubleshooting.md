# Troubleshooting

Common issues and solutions for Data Hub.

## Pipeline Issues

### Pipeline Won't Start

**Symptoms:** Run button does nothing or returns error

**Possible causes:**

1. **Missing permissions**
   - Check user has `RunDataHubPipeline` permission
   - Solution: Assign permission to user's role

2. **Pipeline disabled**
   - Check pipeline `enabled` status
   - Solution: Enable pipeline in settings

3. **Job queue not running**
   - Check worker processes are active
   - Solution: Start job queue workers

4. **Pipeline already running**
   - Check for existing runs in progress
   - Solution: Wait for completion or cancel

### No Records Extracted

**Symptoms:** Run completes but 0 records processed

**Check:**

1. **Extractor configuration**
   - Verify endpoint URL is correct
   - Test API manually with same parameters
   - Check authentication credentials

2. **Items field path**
   - Verify `itemsField` points to correct path in response
   - Use browser dev tools to inspect actual response

3. **Connection issues**
   - Test connection using "Test" button
   - Check network access from server

4. **Empty source**
   - Source may legitimately have no data
   - Check source system directly

### Records Failing Validation

**Symptoms:** High error rate, records quarantined

**Steps:**

1. Check error messages in Errors view
2. View sample failed records
3. Identify common patterns
4. Options:
   - Fix source data
   - Adjust validation rules
   - Add transform operators to clean data

### Transform Errors

**Symptoms:** Records fail during transform step

**Common causes:**

1. **Missing fields**
   - Operator references field that doesn't exist
   - Add null checks or default values

2. **Type mismatches**
   - String operation on number, etc.
   - Add type conversion operator first

3. **Template errors**
   - Invalid Handlebars syntax
   - Test templates with sample data

### Load Failures

**Symptoms:** Records reach load step but fail

**Check:**

1. **Required fields**
   - Vendure entity requires certain fields
   - Ensure all required fields are mapped

2. **Unique constraints**
   - SKU, slug, etc. must be unique
   - Check for duplicates in source data

3. **Invalid references**
   - Product variant without product
   - Asset references invalid file

4. **Channel/language issues**
   - Wrong channel configured
   - Missing translations

## Connection Issues

### Connection Test Fails

**Database connections:**

1. Verify host is reachable from server
2. Check port is open (firewall rules)
3. Verify credentials are correct
4. Check SSL requirements

**API connections:**

1. Test URL directly (curl/Postman)
2. Verify authentication method
3. Check API rate limits
4. Review API logs

### Timeout Errors

**Symptoms:** "Connection timeout" or "Request timeout"

**Solutions:**

1. Increase timeout in connection settings
2. Check network latency
3. Verify service is responding
4. Consider connection pooling

## Secret Issues

### Secret Value Not Resolving

**Symptoms:** API calls fail with auth errors

**Check:**

1. Secret code matches configuration exactly
2. For env provider: environment variable is set
3. For inline provider: value is correct
4. Server was restarted after env var change

### Environment Variable Not Found

**Symptoms:** "Environment variable X not found"

**Solutions:**

1. Verify variable is exported in shell
2. Check .env file is loaded
3. Restart server after changes
4. Use `printenv` to verify

## Performance Issues

### Slow Pipeline Execution

**Analyze:**

1. Check step durations in run metrics
2. Identify slowest step
3. Review that step's configuration

**Solutions:**

1. **Slow extraction**
   - Enable pagination
   - Reduce page size
   - Add concurrency

2. **Slow transforms**
   - Reduce async operations
   - Cache lookup data
   - Simplify complex operators

3. **Slow loads**
   - Increase batch size
   - Add concurrency
   - Use bulk operations

### High Memory Usage

**Causes:**

1. Very large batch sizes
2. Large records with attachments
3. Memory leaks in custom adapters

**Solutions:**

1. Reduce batch size
2. Use streaming for large files
3. Profile memory usage

### Job Queue Backlog

**Symptoms:** Jobs pile up, runs delayed

**Solutions:**

1. Add more worker processes
2. Increase worker poll rate
3. Review job processing time
4. Consider dedicated queues

## Error Messages

### "Adapter not found: xxx"

Adapter code doesn't exist.

**Solutions:**
- Check adapter code spelling
- Verify adapter is registered
- Check `registerBuiltinAdapters` is true

### "Connection not found: xxx"

Connection code doesn't exist.

**Solutions:**
- Verify connection code
- Create connection if missing
- Check code-first config

### "Secret not found: xxx"

Secret code doesn't exist.

**Solutions:**
- Verify secret code
- Create secret if missing
- Check code-first config

### "Invalid pipeline definition"

Pipeline JSON is malformed.

**Solutions:**
- Validate JSON syntax
- Check for required fields
- Use validation mutation

### "FORBIDDEN" GraphQL error

Missing permission.

**Solutions:**
- Check user permissions
- Verify role assignments
- Check channel context

## Debugging Tips

### Enable Debug Logging

```typescript
DataHubPlugin.init({
    debug: true,
})
```

### View Detailed Logs

1. Go to run details
2. Click Logs tab
3. Filter by level/step
4. Look for error context

### Test in Isolation

1. Create minimal test pipeline
2. Use sample data
3. Test one step at a time
4. Add complexity gradually

### Validate Incrementally

1. Save pipeline frequently
2. Use "Validate" button
3. Fix issues before adding more

### Check Data Flow

1. Add logging operators
2. Use preview feature
3. Check record structure at each step

## Database Issues

### Migration Failures

**Symptoms:** Migrations fail to run or partially complete

**Solutions:**

1. **Check migration status:**
   ```bash
   npm run migration:show
   ```

2. **Manual migration:**
   ```bash
   npm run migration:run
   ```

3. **Rollback if needed:**
   ```bash
   npm run migration:revert
   ```

4. **Clear migration cache:**
   ```bash
   rm -rf dist/migrations
   npm run build
   ```

### Connection Pool Exhaustion

**Symptoms:** "Too many connections" or "Connection pool timeout"

**Solutions:**

1. **Increase pool size:**
   ```typescript
   dbConnectionOptions: {
       extra: {
           max: 20,  // Increase from default 10
       }
   }
   ```

2. **Check for connection leaks:**
   - Review custom adapters
   - Ensure connections are released
   - Monitor active connections

3. **Reduce concurrent pipelines:**
   - Limit parallel pipeline executions
   - Schedule pipelines at different times

### Deadlock Errors

**Symptoms:** "Deadlock detected" or "Lock wait timeout"

**Solutions:**

1. **Reduce concurrency:**
   ```typescript
   throughput: {
       concurrency: 1,  // Sequential processing
   }
   ```

2. **Use smaller batches:**
   ```typescript
   throughput: {
       batchSize: 20,  // Reduce lock contention
   }
   ```

3. **Optimize queries:**
   - Add missing indexes
   - Review slow queries
   - Use EXPLAIN ANALYZE

## Webhook Issues

### Webhook Not Triggering

**Symptoms:** Pipeline doesn't run when webhook called

**Check:**

1. **Webhook path is correct:**
   ```
   POST https://your-domain.com/data-hub/webhook/your-path
   ```

2. **Signature verification:**
   - Verify secret is correct
   - Check signature algorithm matches
   - Test with signature disabled temporarily

3. **Request format:**
   - Content-Type: application/json
   - Valid JSON body
   - Required headers present

4. **Check webhook logs:**
   ```graphql
   query {
     dataHubWebhookLogs(options: { take: 10 }) {
       items {
         path
         statusCode
         errorMessage
       }
     }
   }
   ```

### Webhook Authentication Failures

**Symptoms:** "Invalid signature" or "Unauthorized"

**Solutions:**

1. **Verify signature calculation:**
   ```javascript
   const crypto = require('crypto');
   const secret = 'your-secret';
   const payload = JSON.stringify(requestBody);
   const signature = crypto
       .createHmac('sha256', secret)
       .update(payload)
       .digest('hex');
   ```

2. **Check header name:**
   - X-Signature-256 (HMAC-SHA256)
   - X-Signature-1 (HMAC-SHA1)
   - Custom header if configured

3. **Verify secret storage:**
   - Secret code matches
   - Secret value is correct
   - No extra whitespace

### Duplicate Webhook Processing

**Symptoms:** Same webhook processed multiple times

**Solutions:**

1. **Use idempotency keys:**
   ```typescript
   trigger: {
       type: 'WEBHOOK',
       idempotencyKey: 'X-Request-ID',
   }
   ```

2. **Check webhook retry logic:**
   - Some services retry on timeout
   - Return 200 quickly to prevent retries
   - Process asynchronously

## Scheduled Pipeline Issues

### Schedule Not Running

**Symptoms:** Pipeline doesn't execute at scheduled time

**Check:**

1. **Cron expression is valid:**
   ```bash
   # Test cron expression
   # Use online cron validator
   0 2 * * *  # Valid: 2 AM daily
   ```

2. **Timezone is correct:**
   ```typescript
   trigger: {
       type: 'SCHEDULE',
       cron: '0 2 * * *',
       timezone: 'America/New_York',  // Explicit timezone
   }
   ```

3. **Pipeline is enabled:**
   - Check enabled status
   - Verify schedule is active

4. **Scheduler service is running:**
   ```bash
   # Check logs for scheduler
   pm2 logs vendure | grep "SchedulerService"
   ```

### Schedule Running at Wrong Time

**Symptoms:** Pipeline runs at unexpected times

**Solutions:**

1. **Check server timezone:**
   ```bash
   date
   timedatectl  # Linux
   ```

2. **Use explicit timezone:**
   ```typescript
   timezone: 'UTC'  // Always use explicit timezone
   ```

3. **Test cron expression:**
   - Use crontab.guru or similar
   - Verify DST handling

## Event Trigger Issues

### Event Not Firing Pipeline

**Symptoms:** Vendure event occurs but pipeline doesn't run

**Check:**

1. **Event name is correct:**
   ```typescript
   event: 'ProductEvent'  // Must match Vendure event class
   ```

2. **Event filter matches:**
   ```typescript
   filter: {
       type: 'updated'  // Must match event property
   }
   ```

3. **Event subscription is active:**
   - Check plugin is loaded
   - Verify event handlers registered

4. **Check event logs:**
   ```graphql
   query {
     dataHubEventLogs(options: { take: 10 }) {
       items {
         eventType
         handled
         errorMessage
       }
     }
   }
   ```

## File Processing Issues

### File Not Found

**Symptoms:** "ENOENT: no such file or directory"

**Solutions:**

1. **Use absolute paths:**
   ```typescript
   path: '/var/data/imports/file.csv'  // Absolute
   // Not: './imports/file.csv'         // Relative
   ```

2. **Check permissions:**
   ```bash
   ls -la /var/data/imports/
   # Ensure vendure process can read
   ```

3. **Verify file exists:**
   ```bash
   stat /var/data/imports/file.csv
   ```

### File Parsing Errors

**Symptoms:** "Invalid CSV" or "Parse error"

**Common causes:**

1. **Encoding issues:**
   ```typescript
   extract: {
       encoding: 'utf-8',  // or 'iso-8859-1', 'windows-1252'
   }
   ```

2. **Delimiter mismatch:**
   ```typescript
   delimiter: ';'  // European CSV
   delimiter: '\t'  // TSV
   ```

3. **Malformed data:**
   - Unescaped quotes
   - Inconsistent columns
   - Binary data in text file

4. **BOM (Byte Order Mark):**
   - Some editors add BOM
   - Can break parsing
   - Strip BOM or configure parser

### Large File Memory Issues

**Symptoms:** Out of memory errors with large files

**Solutions:**

1. **Use streaming:**
   - Extractors already stream by default
   - Don't load entire file into memory

2. **Reduce batch size:**
   ```typescript
   throughput: {
       batchSize: 100,  // Smaller batches
   }
   ```

3. **Enable checkpointing:**
   ```typescript
   checkpointing: {
       enabled: true,
       intervalRecords: 5000,
   }
   ```

4. **Split large files:**
   ```bash
   split -l 10000 large-file.csv chunk-
   ```

## API Integration Issues

### Rate Limiting

**Symptoms:** 429 Too Many Requests errors

**Solutions:**

1. **Add rate limiting:**
   ```typescript
   throughput: {
       rateLimitRps: 5,  // 5 requests per second
   }
   ```

2. **Reduce concurrency:**
   ```typescript
   throughput: {
       concurrency: 1,  // Sequential requests
   }
   ```

3. **Add retry with backoff:**
   ```typescript
   errorHandling: {
       maxRetries: 5,
       retryDelayMs: 2000,
       backoffMultiplier: 2,  // Exponential backoff
   }
   ```

### API Response Parsing

**Symptoms:** "Cannot read property of undefined"

**Solutions:**

1. **Check data path:**
   ```typescript
   dataPath: 'data.items'  // Must match response structure
   ```

2. **Inspect actual response:**
   ```bash
   curl -X GET https://api.example.com/products \
     -H "Authorization: Bearer token"
   ```

3. **Handle missing data:**
   ```typescript
   operators: [
       { op: 'default', args: { path: 'items', value: [] } }
   ]
   ```

### SSL/TLS Errors

**Symptoms:** "UNABLE_TO_VERIFY_LEAF_SIGNATURE" or "CERT_HAS_EXPIRED"

**Solutions:**

1. **Update CA certificates:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get update ca-certificates

   # macOS
   brew upgrade openssl
   ```

2. **Disable SSL verification (development only):**
   ```typescript
   // NOT recommended for production
   process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
   ```

3. **Use custom CA:**
   ```typescript
   connectionConfig: {
       ca: fs.readFileSync('/path/to/ca.pem'),
   }
   ```

## Search Index Issues

### Index Out of Sync

**Symptoms:** Search results don't match database

**Solutions:**

1. **Rebuild index:**
   ```graphql
   mutation {
     rebuildDataHubSearchIndex(indexName: "products") {
       success
       itemsIndexed
     }
   }
   ```

2. **Check sync pipeline status:**
   - Verify sync pipeline is enabled
   - Check for errors in recent runs

3. **Verify index mapping:**
   - Check field types match
   - Verify tokenization settings

### Indexing Failures

**Symptoms:** "Index error" or documents not appearing

**Check:**

1. **Bulk size too large:**
   ```typescript
   bulkSize: 500  // Reduce if failing
   ```

2. **Document structure:**
   - All required fields present
   - Field types match index mapping
   - No invalid characters

3. **Connection issues:**
   - Search engine is reachable
   - Credentials are correct
   - Firewall allows access

## Gate Approval Issues

### Gate Not Pausing

**Symptoms:** Pipeline runs through gate without pausing

**Check:**

1. **Gate type:**
   ```typescript
   approvalType: 'MANUAL'  // Requires manual approval
   ```

2. **Gate is in pipeline flow:**
   - Verify edge connects to gate
   - Check gate isn't skipped by route

3. **Check gate logs:**
   ```graphql
   query {
     dataHubGateApprovals(options: { take: 10 }) {
       items {
         pipelineId
         status
         approvedAt
       }
     }
   }
   ```

### Timeout Not Working

**Symptoms:** Gate doesn't auto-approve after timeout

**Solutions:**

1. **Verify timeout configuration:**
   ```typescript
   timeoutSeconds: 3600  // 1 hour
   ```

2. **Check scheduler is running:**
   - Timeout checking runs periodically
   - Verify scheduler service

3. **Review gate status:**
   - May be approved manually before timeout
   - Check approval logs

## Custom Adapter Issues

### Adapter Not Loading

**Symptoms:** "Adapter not found" for custom adapter

**Check:**

1. **Adapter is registered:**
   ```typescript
   DataHubPlugin.init({
       adapters: [myCustomAdapter],
   })
   ```

2. **Adapter code matches:**
   ```typescript
   code: 'my-custom-adapter'  // Exact match required
   ```

3. **TypeScript compilation:**
   ```bash
   npm run build
   ```

4. **Import path:**
   ```typescript
   import { myAdapter } from './adapters/my-adapter';
   ```

### Custom Operator Errors

**Symptoms:** Transform step fails with custom operator

**Debug:**

1. **Add logging:**
   ```typescript
   applyOne(record, config, helpers) {
       console.log('Input:', record);
       // ... operator logic ...
       console.log('Output:', result);
       return result;
   }
   ```

2. **Test in isolation:**
   ```typescript
   const result = myOperator.applyOne(
       { test: 'data' },
       { /* config */ },
       helpers
   );
   expect(result).toEqual({ /* expected */ });
   ```

3. **Check return value:**
   - Must return record object
   - Return null to skip record
   - Throw error to fail record

## Memory Leaks

### Detecting Memory Leaks

**Symptoms:** Memory usage grows over time

**Tools:**

1. **Node.js heap snapshots:**
   ```bash
   node --inspect server.js
   # Open chrome://inspect
   # Take heap snapshots
   ```

2. **Monitor memory:**
   ```typescript
   setInterval(() => {
       const used = process.memoryUsage();
       console.log('Memory:', Math.round(used.heapUsed / 1024 / 1024), 'MB');
   }, 60000);
   ```

3. **Use clinic.js:**
   ```bash
   npm install -g clinic
   clinic doctor -- node server.js
   ```

### Common Causes

1. **Event listener leaks:**
   ```typescript
   // Bad
   eventEmitter.on('event', handler);

   // Good
   const handler = () => { /* ... */ };
   eventEmitter.once('event', handler);
   // Or: eventEmitter.removeListener('event', handler);
   ```

2. **Global caches:**
   ```typescript
   // Bad
   const cache = new Map();  // Never cleared

   // Good
   const cache = new LRU({ max: 1000 });  // Bounded
   ```

3. **Timers not cleared:**
   ```typescript
   // Bad
   setInterval(fn, 1000);

   // Good
   const timer = setInterval(fn, 1000);
   // Later: clearInterval(timer);
   ```

## Debugging Techniques

### Enable Verbose Logging

```typescript
DataHubPlugin.init({
    logging: {
        level: 'DEBUG',  // DEBUG, INFO, WARN, ERROR
        logQueries: true,
        logSteps: true,
    },
})
```

### Add Debug Hooks

```typescript
.hooks({
    AFTER_EXTRACT: [{
        type: 'INTERCEPTOR',
        name: 'Debug log',
        code: `
            console.log('Extracted records:', records.length);
            console.log('Sample:', records[0]);
            return records;
        `,
    }],
})
```

### Use Dry Run Mode

```graphql
mutation {
  runDataHubPipeline(id: "pipeline-id", dryRun: true) {
    id
    status
  }
}
```

### Inspect Database State

```sql
-- Check recent runs
SELECT id, status, started_at, records_processed
FROM data_hub_pipeline_run
ORDER BY started_at DESC
LIMIT 10;

-- Check errors
SELECT * FROM data_hub_record_error
WHERE run_id = 'run-id'
LIMIT 10;

-- Check checkpoints
SELECT * FROM data_hub_checkpoint
WHERE pipeline_id = 'pipeline-id';
```

### Profile Performance

```typescript
.hooks({
    BEFORE_TRANSFORM: [{
        type: 'INTERCEPTOR',
        code: `
            context.startTime = Date.now();
            return records;
        `,
    }],
    AFTER_TRANSFORM: [{
        type: 'INTERCEPTOR',
        code: `
            const duration = Date.now() - context.startTime;
            const rps = Math.round(records.length / (duration / 1000));
            console.log(\`Transform: \${duration}ms, \${rps} rec/sec\`);
            return records;
        `,
    }],
})
```

## Emergency Procedures

### Stop Runaway Pipeline

1. **Cancel via UI:**
   - Go to run details
   - Click "Cancel" button

2. **Cancel via GraphQL:**
   ```graphql
   mutation {
     cancelDataHubPipelineRun(id: "run-id") {
       success
     }
   }
   ```

3. **Force kill (last resort):**
   ```bash
   # Find process
   ps aux | grep vendure

   # Kill process
   kill -9 PID
   ```

### Recover from Failed Migration

1. **Restore from backup:**
   ```bash
   psql vendure_db < backup.sql
   ```

2. **Rollback package:**
   ```bash
   npm install @oronts/vendure-data-hub-plugin@1.5.0
   ```

3. **Restart server:**
   ```bash
   pm2 restart vendure
   ```

### Clear Stuck Queue

```sql
-- View queue
SELECT * FROM job_queue
WHERE queue_name = 'data-hub-run'
AND state = 'PENDING';

-- Clear stuck jobs (use with caution)
DELETE FROM job_queue
WHERE queue_name = 'data-hub-run'
AND state = 'PENDING'
AND created_at < NOW() - INTERVAL '1 hour';
```

## Getting Help

If you can't resolve an issue:

1. Check the logs for full error details
2. Gather configuration information
3. Create minimal reproduction
4. Contact support with:
   - Error messages
   - Pipeline configuration
   - Vendure version
   - Data Hub version
   - Steps to reproduce

### Support Channels

- **GitHub Issues:** https://github.com/oronts/vendure-data-hub-plugin/issues
- **Discord:** Vendure community server
- **Email:** support@example.com

### Diagnostic Information

When reporting issues, include:

```bash
# System info
node --version
npm --version
npx vendure version

# Plugin version
npm list @oronts/vendure-data-hub-plugin

# Database version
psql --version

# Recent logs
pm2 logs vendure --lines 100

# Pipeline configuration (sanitized)
# Export pipeline as JSON, remove sensitive data
```

## See Also

- [Performance Tuning](./performance.md) - Optimization guide
- [Configuration Guide](./configuration.md) - Plugin configuration
- [Migration Guide](./migrations.md) - Upgrading between versions
- [Testing Guide](../developer-guide/testing.md) - Testing strategies

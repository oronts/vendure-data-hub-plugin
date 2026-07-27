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

2. **Data path**
   - Verify `dataPath` points to the records array in the response
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

Check the secret detail status and runtime source before changing the database row:

1. Confirm the pipeline code matches exactly.
2. If the row says **Code-first active**, runtime uses the in-memory definition; database edits are intentionally blocked.
3. For ENV, confirm the referenced variable exists in the exact API server or worker process executing the pipeline.
4. For database INLINE, confirm every process uses the same DATAHUB_MASTER_KEY.
5. Restart processes after environment changes.

### Environment Variable Not Found

A stored ENV reference only proves that the variable name is syntactically valid. It does not prove the variable exists.

1. Verify the variable in the service manager, container, and worker environment, not only an interactive shell.
2. Check that the env file is loaded by the production process.
3. Restart every API server and worker after changes.
4. Use printenv in the same runtime context without printing the secret into shared logs.

### Encrypted Value Cannot Be Decrypted

This means the configured key is missing, different from the encryption key, or the stored envelope is corrupt. Restore the correct key or replace the credential.

1. Stop mixed-key processes.
2. Restore the correct durable key on every process, or re-enter the known plaintext under the intended new key.
3. If the old key and plaintext are both unavailable, clear or delete the unrecoverable row and obtain a replacement from the credential authority.
4. Test representative connections before resuming pipelines.

### Unencrypted Inline Status

Runtime resolution rejects unencrypted database INLINE values. Configure a durable master key and enter a replacement value to create a new encrypted envelope. The UI never returns the old value.

### Code-First Secret Removed but Old Credential Became Active

A historical same-code database row can become the fallback after a code-first definition is removed. Before removal, inspect rows marked **Code-first active** and delete or deliberately migrate the inactive database row.

### Config File Prevents Startup

When configPath is set, missing, unreadable, unsupported, malformed, or non-object JSON/YAML is fatal by design. Fix the path relative to the process working directory, file permissions, extension, syntax, root object, duplicate codes, or invalid secret definition. The previous in-memory snapshot is never partially replaced.
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

**Symptoms:** A host-project Vendure migration fails or only part of its DDL is
visible.

**Solutions:**

1. Stop API and worker processes that can use the affected schema.
2. Restore or verify the pre-migration backup before attempting another change.
3. From the host Vendure project, inspect the generated migration and the
   database migration table.
4. Run reviewed pending migrations with the current Vendure CLI:

   ```bash
   npx vendure migrate -r
   ```

5. Revert only when the last migration's `down()` method has been reviewed and
   will not discard production data:

   ```bash
   npx vendure migrate --revert
   ```

Do not enable `synchronize` or delete compiled migration files as a production
repair. See [Database and Upgrade Migrations](./migrations.md) for generation,
backup, deployment, and rollback procedures.

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

4. **Check pipeline run logs for webhook errors:**
   ```graphql
   query {
     dataHubLogs(options: { take: 10 }) {
       items {
         id
         level
         message
         stepKey
         createdAt
       }
       totalItems
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
       authentication: 'HMAC',
       secretCode: 'webhook-secret',
       requireIdempotencyKey: true,
       idempotencyKeyHeader: 'X-Request-ID',
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

   The value must be one of the event class names offered by the Dashboard.
   Wildcards, action suffixes such as `.updated`, and trigger-level `filter`
   fields are rejected. Filter seeded records in a downstream pipeline step.

2. **Transactional handoff is active:**
   - Check the plugin registered all blocking EVENT handlers
   - Confirm the host migration created `data_hub_event_trigger_outbox`
   - Inspect pending rows, `attempts`, and `lastError` for enqueue failures
   - Confirm a worker consumes `data-hub.event-trigger-outbox` and `data-hub.run`
   - Use a persistent Vendure job-queue strategy in production

3. **Check pipeline run logs for event trigger errors:**
   ```graphql
   query {
     dataHubLogs(options: { take: 10 }) {
       items {
         id
         level
         message
         stepKey
         createdAt
       }
       totalItems
     }
   }
   ```

## File Processing Issues

### Uploaded File Not Found

**Symptoms:** The extractor logs that an uploaded file is missing or empty and returns no records.

**Solutions:**

1. Confirm the step uses the format-specific adapter and a Data Hub file ID:

   ```typescript
   .extract('parse-csv', {
       adapterCode: 'csv',
       fileId: 'uploaded-file-id',
       hasHeader: true,
   })
   ```

2. Upload the file again in the import wizard or with `POST /data-hub/upload`. Copy `file.id` from the response; a filename or server path is not a valid `fileId`.
3. Use `GET /data-hub/files` to verify that the ID still exists. Uploaded files can expire according to the configured retention policy.
4. Verify that the administrator has `ManageDataHubFiles` to upload and `ReadDataHubFiles` to list or inspect files.

### File Parsing Errors

**Symptoms:** The extractor returns no records or logs a CSV, JSON, XML, or spreadsheet parse error.

**Checks:**

1. Match the adapter to the uploaded format: `csv`, `json`, `xml`, or `xlsx`.
2. For CSV, verify `delimiter` and `hasHeader`. TSV has no separate adapter; set `delimiter: '\t'` on the CSV adapter.
3. For JSON, verify that `itemsPath` points to the array of records.
4. For XML, verify that `recordPath` points to the repeated record elements.
5. For XLSX, verify `sheetName` and whether the sheet contains a header row.
6. Save text files as UTF-8 and check malformed quoting, inconsistent columns, invalid JSON/XML, or binary content in a text upload.

### Large File Memory Issues

**Symptoms:** Out-of-memory errors with large uploads.

Uploaded files are currently parsed into memory before downstream batches execute. Reducing `throughput.batchSize` can reduce downstream processing pressure but does not make parsing streaming.

- Split oversized source files before uploading them.
- Keep the upload size limit aligned with available worker memory.
- Load-test CSV, JSON, XML, and XLSX independently because their memory overhead differs.
- File extractors persist record offsets automatically. A later run still parses the uploaded file before applying its saved offset; set `resetCheckpoint: true` on the extractor to start from the beginning.

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

1. **Run the controlled reindex path:**
   - confirm which external sink or Vendure search plugin owns the index;
   - use that system's documented reindex operation, or run a published Data Hub
     pipeline whose source intentionally reads the complete catalog;
   - verify checkpoint and incremental-source settings before starting; and
   - inspect the run's processed/failed counts and the target index count.

   Data Hub does not expose a `rebuildDataHubSearchIndex` mutation. Do not clear
   an external index unless the replacement pipeline and rollback plan have been
   tested.

2. **Check the sync pipeline:**
   - verify it is enabled and published;
   - check recent run errors and sink responses; and
   - confirm mappings match the target index schema.

### Indexing Failures

**Symptoms:** "Index error" or documents not appearing

**Check:**

1. **Bulk size too large:**
   ```typescript
   batchSize: 500  // Reduce if failing
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

3. **Check pipeline run logs for gate activity:**
   ```graphql
   query {
     dataHubLogs(options: { take: 10 }) {
       items {
         id
         level
         message
         stepKey
         createdAt
       }
       totalItems
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

   `timeoutSeconds` must be an integer between 1 and 31,536,000 and is required
   when `approvalType` is `TIMEOUT`.

2. **Check gate maintenance on the server process:**
   - Timeout checking runs independently of Vendure scheduled tasks
   - Due rows are polled every 30 seconds in batches of 100
   - Verify the host migration added `gateStepKey`, `gateTimeoutAt`,
     `gateTimeoutLeaseToken`, and `gateTimeoutLeaseExpiresAt` plus both status
     indexes to `data_hub_pipeline_run`

3. **Review gate status:**
   - May be approved manually before timeout
   - Inspect the run's gate key and deadline through `dataHubPipelineRun`
   - A failed timeout attempt is retried after its 60-second lease expires
   - Check approval and timeout logs

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
  startDataHubPipelineRun(pipelineId: "pipeline-id") {
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

Hook contexts are recreated at every stage, so values written to `context` in a
before hook are not available to its matching after hook. Use persisted log
timestamps and run analytics for duration measurements; hooks can add boundary
markers:

```typescript
.hooks({
    BEFORE_TRANSFORM: [{
        type: 'LOG',
        level: 'INFO',
        message: 'Transform step started',
    }],
    AFTER_TRANSFORM: [{
        type: 'LOG',
        level: 'INFO',
        message: 'Transform step completed',
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
       id
       status
     }
   }
   ```

3. **Stop processing safely if cancellation cannot complete:**
   - pause the trigger source;
   - stop the affected worker through the deployment's process manager;
   - inspect the run and Vendure job state before restarting; and
   - inspect the adapter-specific checkpoint before starting a new run; use an
     adapter reset option where one is documented.

   A forced process termination can leave a run marked `RUNNING`; it is not a
   substitute for cancellation and recovery.

### Recover from Failed Migration

1. Keep APIs, workers, schedules, and external triggers stopped.
2. Inspect the failed migration and database state. MySQL/MariaDB DDL may be
   partially applied even when the migration reports failure.
3. Restore the tested pre-deployment database backup when schema or data integrity
   is uncertain.
4. Restore the previous application artifact, configuration, lockfile,
   environment, and `DATAHUB_MASTER_KEY` as one release unit.
5. Reinstall exactly from the restored lockfile when required:

   ```bash
   npm ci
   ```

6. Start the previous API and worker build and repeat the validation checklist in
   [Database and Upgrade Migrations](./migrations.md#validation-checklist).

### Clear Stuck Queue

```sql
-- View queue
SELECT * FROM job_queue
WHERE queue_name = 'data-hub.run'
AND state = 'PENDING';

-- Clear stuck jobs (use with caution)
DELETE FROM job_queue
WHERE queue_name = 'data-hub.run'
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

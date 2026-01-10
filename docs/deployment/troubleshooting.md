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

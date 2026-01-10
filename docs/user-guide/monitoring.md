# Monitoring & Logs

Track pipeline executions, view logs, and debug issues.

<p align="center">
  <img src="../images/05-logs-analytics.png" alt="Logs & Analytics Dashboard" width="700">
  <br>
  <em>Analytics Dashboard - Real-time metrics and pipeline health overview</em>
</p>

## Run History

### Viewing Runs

1. Go to **Data Hub > Runs**
2. See all pipeline executions
3. Filter by:
   - Pipeline
   - Status (running, completed, failed)
   - Date range

### Run Details

Click a run to see:

- **Status** - Current state
- **Timing** - Start, end, duration
- **Metrics** - Records processed, failed
- **Steps** - Per-step execution details
- **Logs** - Execution logs

## Run Statuses

| Status | Description |
|--------|-------------|
| Pending | Scheduled, waiting to start |
| Running | Currently executing |
| Completed | Finished successfully |
| Failed | Stopped due to error |
| Cancelled | Manually stopped |
| Partial | Completed with some failures |

## Execution Logs

### Viewing Logs

1. Open a run
2. Click **Logs** tab
3. View chronological log entries

### Log Levels

| Level | Description |
|-------|-------------|
| Debug | Detailed debugging information |
| Info | General execution information |
| Warning | Potential issues that didn't stop execution |
| Error | Errors that caused record failures |

### Filtering Logs

Filter logs by:
- Level (debug, info, warn, error)
- Step (extract, transform, load, etc.)
- Time range
- Search text

### Log Retention

Logs are retained based on plugin settings:
- Configure in **Data Hub > Settings**
- Default: 30 days
- Adjust based on debugging needs and storage

## Step Metrics

Each step tracks:

| Metric | Description |
|--------|-------------|
| Records In | Records received from previous step |
| Records Out | Records passed to next step |
| Records Failed | Records that failed processing |
| Duration | Time spent in this step |
| Throughput | Records per second |

### Viewing Step Details

1. Open a run
2. Click **Steps** tab
3. See per-step breakdown
4. Click a step for detailed metrics

## Error Tracking

### Viewing Errors

1. Go to **Data Hub > Errors**
2. See all failed records across pipelines
3. Filter by:
   - Pipeline
   - Step
   - Error type
   - Date range

### Error Details

Click an error to see:

- **Record Data** - The original record that failed
- **Error Message** - What went wrong
- **Stack Trace** - Full error details
- **Context** - Pipeline, step, run information

### Retrying Records

1. Select one or more error records
2. Click **Retry Selected**
3. Failed records are reprocessed

Or retry from the run view:
1. Open the failed run
2. Click **Retry Failed Records**

### Deleting Errors

1. Select error records
2. Click **Delete Selected**
3. Confirm deletion

Use this for records that cannot be fixed (bad source data).

## Analytics

### Dashboard Metrics

Go to **Data Hub > Analytics** to see:

- **Run Success Rate** - Percentage of successful runs
- **Average Duration** - Typical run time
- **Records Processed** - Total over time period
- **Error Rate** - Percentage of failed records

### Pipeline Performance

View per-pipeline metrics:

- Run history chart
- Average records per run
- Average duration trend
- Error rate over time

### Step Performance

Identify bottlenecks:

- Slowest steps across pipelines
- Steps with highest error rates
- Throughput by step type

## Alerts

### Setting Up Alerts

Configure notifications for pipeline events:

1. Go to **Data Hub > Settings > Alerts**
2. Configure alert conditions:
   - Run failed
   - Error rate exceeds threshold
   - Run duration exceeds threshold
3. Set notification channels:
   - Email
   - Webhook
   - Slack (via webhook)

### Alert Conditions

| Condition | Trigger |
|-----------|---------|
| Run Failed | Any run fails |
| High Error Rate | Error rate exceeds X% |
| Long Duration | Run exceeds X minutes |
| No Runs | Pipeline hasn't run in X hours |

## Debugging Tips

### Common Issues

**No records extracted:**
1. Check extractor configuration
2. Verify connection settings
3. Test the data source manually
4. Check `itemsField` path is correct

**Records failing validation:**
1. View error details
2. Check validation rules
3. Sample the source data
4. Adjust validation or source data

**Records not loading:**
1. Check loader configuration
2. Verify field mappings
3. Check for required fields
4. Review load strategy

**Slow execution:**
1. Check step durations
2. Identify bottleneck steps
3. Adjust batch sizes
4. Review concurrency settings

### Debug Mode

Enable debug logging for detailed output:

```typescript
DataHubPlugin.init({
    debug: true,
})
```

Or per-pipeline in the trigger configuration.

### Dry Run

Test pipelines without making changes:

1. Clone the pipeline
2. Remove or disable load steps
3. Run the copy
4. Review what would have happened

### Sample Data

Preview data at each step:

1. Open the pipeline editor
2. Click **Preview** on a step
3. See sample records
4. Verify transformations

## Best Practices

### Regular Monitoring

- Check the dashboard daily
- Review error queue weekly
- Analyze performance monthly

### Alert Configuration

- Set up alerts for critical pipelines
- Don't alert on expected failures
- Use appropriate thresholds

### Log Management

- Configure appropriate retention
- Export logs for long-term storage
- Search logs during debugging

### Error Handling

- Review errors promptly
- Categorize recurring errors
- Fix root causes, not just symptoms

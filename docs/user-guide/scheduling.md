# Scheduling Pipelines

Automate pipeline execution with schedules, webhooks, and event triggers.

## Trigger Types

| Type | Description |
|------|-------------|
| Manual | Run via UI or API |
| Schedule | Cron-based timing |
| Webhook | HTTP endpoint trigger |
| Event | Vendure event trigger |
| File | File arrival trigger |
| Message | Message queue trigger |

## Manual Triggers

The default trigger type. Run pipelines on demand:

- Click **Run** in the UI
- Call the GraphQL mutation
- Use the CLI

```typescript
.trigger('start', { type: 'manual' })
```

## Schedule Triggers

Run pipelines automatically based on cron expressions.

### Basic Configuration

```typescript
.trigger('schedule', {
    type: 'schedule',
    cron: '0 2 * * *',      // Daily at 2 AM
    timezone: 'UTC',
})
```

### Cron Expression Format

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, 0=Sunday)
│ │ │ │ │
* * * * *
```

### Common Patterns

| Expression | Description |
|------------|-------------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 0 * * *` | Daily at midnight |
| `0 2 * * *` | Daily at 2 AM |
| `0 0 * * 0` | Weekly on Sunday |
| `0 0 1 * *` | Monthly on the 1st |
| `0 6,18 * * *` | At 6 AM and 6 PM |
| `0 0 * * 1-5` | Weekdays at midnight |

### Timezone

Specify the timezone for schedule interpretation:

```typescript
.trigger('schedule', {
    type: 'schedule',
    cron: '0 9 * * *',      // 9 AM in specified timezone
    timezone: 'America/New_York',
})
```

Common timezones:
- `UTC` - Coordinated Universal Time
- `America/New_York` - Eastern Time
- `America/Los_Angeles` - Pacific Time
- `Europe/London` - British Time
- `Europe/Berlin` - Central European Time
- `Asia/Tokyo` - Japan Time

## Webhook Triggers

Trigger pipelines via HTTP POST requests.

### Configuration

```typescript
.trigger('webhook', {
    type: 'webhook',
    path: '/product-sync',
    signature: 'hmac-sha256',
    idempotencyKey: 'X-Request-ID',
})
```

### Endpoint

Webhooks are available at:
```
POST /data-hub/webhook/{pipeline-code}
```

For a pipeline with code `product-import`:
```
POST https://your-vendure.com/data-hub/webhook/product-import
```

### Request Body

Send data in the request body. This data is available to the pipeline:

```bash
curl -X POST https://your-vendure.com/data-hub/webhook/product-import \
  -H "Content-Type: application/json" \
  -d '{"productId": "123", "action": "update"}'
```

### Signature Verification

For security, enable HMAC signature verification:

1. Create a secret for the signing key
2. Configure the webhook:
   ```typescript
   .trigger('webhook', {
       type: 'webhook',
       signature: 'hmac-sha256',
       signatureSecretCode: 'webhook-secret',
   })
   ```
3. Include the signature in requests:
   ```
   X-Hub-Signature-256: sha256=abc123...
   ```

### Idempotency

Prevent duplicate processing with idempotency keys:

```typescript
.trigger('webhook', {
    type: 'webhook',
    idempotencyKey: 'X-Request-ID',
})
```

Send a unique ID in the header:
```
X-Request-ID: unique-request-id-123
```

The same ID will not trigger the pipeline twice within 24 hours.

## Event Triggers

Trigger pipelines when Vendure events occur.

### Configuration

```typescript
.trigger('on-order', {
    type: 'event',
    event: 'OrderPlacedEvent',
    filter: {
        state: 'ArrangingPayment',
    },
})
```

### Available Events

| Event | Description |
|-------|-------------|
| `OrderPlacedEvent` | New order created |
| `OrderStateTransitionEvent` | Order status changed |
| `ProductEvent` | Product created/updated/deleted |
| `ProductVariantEvent` | Variant changes |
| `CustomerEvent` | Customer changes |
| `CollectionModificationEvent` | Collection changes |
| `StockMovementEvent` | Inventory changes |

### Filtering Events

Only trigger on specific conditions:

```typescript
.trigger('on-completed-order', {
    type: 'event',
    event: 'OrderStateTransitionEvent',
    filter: {
        toState: 'Delivered',
    },
})
```

## Managing Schedules

### Viewing Schedules

1. Go to **Data Hub > Pipelines**
2. Scheduled pipelines show their next run time
3. Click a pipeline to see schedule details

### Upcoming Runs

1. Go to **Data Hub > Dashboard**
2. View **Upcoming Schedules** section
3. See next 24 hours of scheduled runs

### Pausing Schedules

Disable a pipeline to pause its schedule:

1. Open the pipeline
2. Toggle **Enabled** to off
3. Save

The schedule remains configured but won't trigger.

### Modifying Schedules

1. Open the pipeline
2. Edit the trigger configuration
3. Save

Changes take effect immediately.

## Overlapping Runs

By default, a new run cannot start if the previous run is still in progress.

Options:

1. **Skip** - Don't start new run if one is running (default)
2. **Queue** - Queue the new run to start after current completes
3. **Allow** - Allow concurrent runs

Configure via pipeline capabilities:

```typescript
.capabilities({
    allowConcurrent: false,  // Skip overlapping runs
})
```

## Best Practices

### Schedule Timing

- Schedule heavy pipelines during off-peak hours
- Stagger multiple pipelines to avoid resource contention
- Consider timezone when scheduling for business hours

### Reliability

- Use idempotency keys for webhooks
- Enable signature verification for public webhooks
- Monitor failed runs and set up alerts

### Resource Management

- Disable pipelines during maintenance
- Clean up old schedules
- Review schedule frequency periodically

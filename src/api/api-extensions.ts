/**
 * DataHub GraphQL API Extensions
 *
 * This file re-exports the combined admin API extensions from the modular schema files.
 * The schema has been split into domain-specific files for better maintainability:
 *
 * - pipeline.schema.ts: Pipeline, runs, checkpoints, errors
 * - secret.schema.ts: Secrets management
 * - connection.schema.ts: External connections
 * - log.schema.ts: Logs and telemetry
 * - job.schema.ts: Simplified ETL jobs
 * - feed.schema.ts: Product feeds (Google Shopping, Facebook, etc.)
 * - analytics.schema.ts: Stats and metrics
 * - adapter.schema.ts: Adapters and extractors
 * - webhook.schema.ts: Webhook delivery and DLQ
 * - destination.schema.ts: Export destinations (S3, SFTP, etc.)
 * - automapper.schema.ts: AutoMapper configuration
 * - storage.schema.ts: File storage
 * - subscription.schema.ts: Real-time subscriptions
 * - queue.schema.ts: Queue stats and settings
 */
export { adminApiExtensions } from './schema';

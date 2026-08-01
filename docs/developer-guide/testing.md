# Testing Guide

This guide describes the test harnesses and release checks that exist in this
repository. It deliberately avoids hypothetical helpers and commands.

## Commands

Run these commands from the package root:

```bash
npm run typecheck
npm run lint
npm run verify:docs
npm test
npm run test:e2e
npm run test:infrastructure
npm run build
npm run verify:package
```

The checks cover different boundaries:

| Command | Boundary |
| --- | --- |
| `npm run typecheck` | Strict first-party TypeScript contract |
| `npm run lint` | Source, dashboard, connector, test, script, and dev-server rules |
| `npm run verify:docs` | Balanced code fences, Markdown/HTML local targets, heading fragments, public imports, npm scripts, and Data Hub GraphQL examples |
| `npm test` | Unit and focused integration specifications through Vitest |
| `npm run test:e2e` | Vendure-backed loader and pipeline behavior |
| `npm run test:infrastructure` | Sequential Docker acceptance for Redis replicas, OTLP, and external protocols |
| `npm run build` | Server declarations, distributable dashboard source, and dashboard bundle |
| `npm run verify:package` | Clean tarball install, CJS/ESM loading, and public-subpath TypeScript compile |

Run a focused specification while developing:

```bash
npx vitest run src/services/config/secret.service.spec.ts
npx vitest run src/runtime/executors/loaders/product-handler.spec.ts
npx vitest run --config vitest.e2e.config.ts e2e/loaders/product-loader.e2e-spec.ts
```

Do not describe a feature as verified because an unrelated suite passed. Name
the exact test and assertion that exercises the behavior.

## Unit and Contract Tests

Unit specifications live beside the source as `*.spec.ts` or `*.spec.tsx`.
Prefer testing public behavior and failure semantics over implementation calls.

Representative existing tests:

- `src/services/pipeline/pipeline-policy.spec.ts` checks runnable lifecycle rules.
- `src/services/events/message-processing.spec.ts` checks broker acknowledgement,
  retry, and dead-letter behavior.
- `src/runtime/executors/sink-handler-security.spec.ts` checks fail-closed sink
  authentication and outbound security.
- `src/services/destinations/export-destination.service.spec.ts` checks durable,
  channel-scoped destination definitions.
- `dashboard/utils/wizard-to-pipeline.spec.ts` checks lossless wizard conversion.
- `src/sdk/dsl/documentation-examples.spec.ts` compiles documented DSL patterns.

Every production bug fix should have a regression test that fails for the old
behavior. Include malformed input, missing configuration, permission-sensitive
paths, partial failures, and empty data where they apply.

### External boundaries

Mocks and spies are allowed in tests only. Use them at the network or Vendure
service boundary, and make their result shape match the real API. Do not mock
the unit under test.

For remote assets, tests use deterministic valid image bytes rather than live
internet URLs. For HTTP and connector paths, assert request construction,
security validation, bounded response handling, and partial-failure mapping.
Real-service verification remains a separate deployment gate.

### Docker infrastructure acceptance

Install dependencies with `npm ci`, ensure Docker Compose is available, then
run an individual boundary or the sequential aggregate:

```bash
npm run test:infrastructure:redis
npm run test:infrastructure:otlp
npm run test:infrastructure:external
npm run test:infrastructure
```

The runners use digest-pinned images, unique Compose project names, local
installed test binaries, bounded waits, and cleanup traps. External service
ports bind only to `127.0.0.1` and use per-run ports where the protocol permits.

The aggregate Redis suite starts independent Node.js processes and checks atomic
shared counters, webhook quotas, locks, Streams consumers, consumer-process
crash recovery, fail-closed outage behavior, and reconnect to one Redis server.
It then starts a primary, two replicas, and a three-Sentinel quorum. The runner
waits until lock and quota state has reached both replicas, keeps the application
client alive, sends `SIGKILL` to the primary from outside that client, and proves
automatic election, replica reconfiguration, and state continuity through both
existing and fresh clients. It does not prove Redis Cluster behavior,
persistence recovery, network-partition or split-brain behavior, or an
infrastructure provider's managed failover.

The OTLP suite uses a real TLS-enabled OpenTelemetry Collector and verifies
metrics, traces, trust of its generated certificate authority, rejection by an
untrusted client, collector-scoped CA loading, structured outage reporting, and
queued retry after restart.
The certificate, collector, and output directories are removed afterward. The
external suite uses MinIO, FTP, SFTP, PostgreSQL, MySQL, a transport-level
Pimcore HTTP server, and the repository mock contracts. PostgreSQL and MySQL
require an ephemeral client certificate and verify the generated server CA and
`localhost` certificate identity. The suite proves active TLS sessions and
rejects an untrusted CA, a hostname mismatch, and a missing client certificate.
It does not replace target AWS IAM/TLS, FTPS, database HA/failover or historical
upgrade rehearsal, private-key SFTP rotation, or an active real Pimcore Data Hub
validation. See the
[production sign-off matrix](../deployment/production.md#target-environment-sign-off)
before making deployment claims.

## Vendure E2E Harness

`npm run test:e2e` uses `vitest.e2e.config.ts` and the shared environment in
`e2e/test-config.ts`. The harness starts Vendure with the plugin, uses an
isolated database, and exercises real Vendure services and persistence.

The loader suites under `e2e/loaders/` verify persisted entities, not only
handler counters. Assertions should cover:

- initial creation;
- idempotent replay;
- each advertised merge/replace/append/skip mode;
- invalid and missing references;
- exact relations, quantities, assets, prices, channels, and translations;
- transaction rollback when a later operation fails;
- Vendure `ErrorResultUnion` outcomes.

Use the shared helpers in `e2e/loaders/mode-test-helpers.ts` only when their
contract matches the loader. A helper must not weaken an assertion to make
different loader semantics look identical.

### API and permission checks

For an added or changed resolver/controller, cover:

- valid authorized input;
- invalid input;
- missing authentication;
- missing action permission;
- wrong channel or inaccessible resource;
- not found and duplicate input;
- concurrent or replayed requests when durability matters.

Resolver unit tests are useful for mapping and fail-closed behavior, but they do
not replace an authenticated Vendure API test.

## Dashboard Tests

Dashboard utilities and state conversions use Vitest specifications next to the
implementation. Keep business conversion logic outside React components so it
can be tested without rendering the whole Vendure dashboard.

Important boundaries include:

- dynamic schema metadata and conditional fields;
- nested configuration round trips;
- mutation result unions and false/no-op results;
- permission matrices and action visibility;
- trigger and destination serialization;
- graph conversion without dropped steps, edges, hooks, or settings.

The supported production check is the Vendure/Vite dashboard build. A raw
standalone TypeScript run can also inspect first-party diagnostics, but installed
Vendure source contains Vite virtual modules that are resolved by the supported
build pipeline.

## Generated Contracts

GraphQL clients and shared enum output are generated by:

```bash
npm run codegen
```

CI runs generation and then requires a clean diff. When the SDL or a dashboard
operation changes, regenerate and review:

- `schema.graphql`;
- `src/gql/generated.ts`;
- `dashboard/gql/`;
- generated shared constants.

Never hand-edit generated files.

## Package Consumer Test

`npm run verify:package` builds on the current `dist` output and then:

1. creates an npm tarball in a temporary directory;
2. installs it into a clean consumer project with peer dependencies;
3. loads the root, SDK, shared, connectors, and Pimcore paths through CommonJS;
4. imports the same paths through ESM;
5. compiles public named imports with strict TypeScript;
6. deletes the temporary consumer.

Run `npm run build` first when invoking this check directly.

## Real Service and Failure-Injection Matrix

Local tests are not proof of third-party infrastructure. Before production,
exercise the final package against every configured service:

- PostgreSQL and MySQL migrations and transaction rollback;
- multi-server/multi-worker leases and lock contention;
- S3-compatible storage, FTP, and SFTP including TLS/host-key failures;
- SMTP rejection, timeout, and private-host policy;
- RabbitMQ, Redis Streams, and SQS redelivery and dead-letter behavior;
- Pimcore pagination, authentication, rate limiting, and schema variation.

Include process termination between durable state transitions. Verify recovery
after restart, duplicate delivery, secret rotation, and exhausted retries.

## Release Checklist

The release workflow must pass all local commands above and also:

```bash
npm audit --omit=dev --audit-level=high
npm sbom --omit=dev --sbom-format=spdx --sbom-type=library
```

Review the generated SBOM and license obligations before distribution. An audit
or SBOM generated from an older lockfile is not release evidence.

## See Also

- [Architecture](./architecture.md)
- [Custom adapters](./extending/README.md)
- [Deployment](../deployment/production.md)
- [Troubleshooting](../deployment/troubleshooting.md)
- [Vendure testing](https://docs.vendure.io/current/core/developer-guide/testing)
- [Vendure worker and job queue](https://docs.vendure.io/current/core/developer-guide/worker-job-queue)

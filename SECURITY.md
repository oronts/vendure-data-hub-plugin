# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a Vulnerability

Do not open a public issue for a suspected security vulnerability. Email
**office@oronts.com** with:

- a description of the vulnerability;
- reproducible steps;
- the potential impact; and
- a suggested fix, if available.

We aim to acknowledge a report within 48 hours and provide an initial assessment
within seven days.

## Security Boundaries

### Outbound HTTP and SSRF

Outbound HTTP features call the plugin's URL validator before the initial
request. The validator accepts only HTTP and HTTPS URLs, rejects known local and
metadata hostnames, resolves DNS, and rejects private or reserved IP addresses by
default.

This validation is defense in depth, not a replacement for network controls. A
preflight DNS check does not pin every client connection or redirect to the
validated address. Use an outbound proxy or firewall allowlist for high-security
deployments, restrict redirect behavior in custom clients, and do not disable
SSRF protection for untrusted pipeline configuration.

`allowedHostnames` is an explicit bypass of the normal hostname and IP checks.
Only use it for hosts that are trusted even if they resolve to a private address.

### Expressions and Scripts

Expression operators use a whitelist validator and a Node VM timeout. Script
operators also validate source text, limit execution time, restrict the globals
supplied by the plugin, and copy record data into the VM context.

Node's VM is not a strong isolation boundary for hostile code. Treat users who
can create, edit, review, or publish script-bearing pipelines as trusted
administrators. Disable script operators when that trust model is inappropriate:

```ts
DataHubPlugin.init({
    security: {
        script: { enabled: false },
    },
});
```

### SQL

The plugin provides identifier validation and escaping utilities, and supported
database handlers use parameter binding for values. Custom adapters and custom
queries remain responsible for parameterizing values, validating identifiers,
using a least-privilege database account, and applying any required channel or
tenant scope.

### Permissions

The plugin registers two Vendure CRUD permission groups and 19 task-specific
permissions. Assign the smallest applicable set to each role. In particular,
separate pipeline read/edit permissions from run, review, and publish permissions
where operational separation is required.

## Secret Handling

- Prefer `provider: 'ENV'` for production credentials. Define each referenced
  environment variable in every API and worker process that can execute a
  pipeline.
- Database-backed `INLINE` values are encrypted at rest with AES-256-GCM. The
  same `DATAHUB_MASTER_KEY`, with at least 32 characters, must be available to
  every API and worker process.
- Production rejects code-first `INLINE` secrets because source configuration is
  not an encrypted storage boundary. Use code-first `ENV` references instead.
- Secret values are write-only through the Admin API. Status metadata can report
  whether a value is encrypted, environment-backed, unencrypted, or missing,
  but it must never include the resolved value.
- Back up the current master key separately from the database. Losing or changing
  the key makes existing encrypted values unreadable. To rotate it, decrypt with
  the old key and re-save every inline value with the new key before removing the
  old key.
- A code-first secret overrides a database row with the same code for that
  process. Removing the code-first definition can reactivate the historical
  database row on the next startup. Delete or deliberately migrate that row
  before removing the override.
- Never commit secret values or production master keys to version control.

## Plugin Security Configuration

The security options belong under `security` in `DataHubPlugin.init()`:

```ts
DataHubPlugin.init({
    security: {
        ssrf: {
            allowedHostnames: ['api.trusted-partner.example'],
            additionalBlockedHostnames: ['legacy.internal.example'],
            additionalBlockedRanges: ['198.51.100.0/24'],
            allowPrivateIPs: false,
        },
        script: {
            enabled: true,
            defaultTimeoutMs: 5_000,
            validation: {
                maxCodeLength: 10_000,
                maxConditionLength: 2_000,
            },
        },
    },
});
```

`disableSsrfProtection` and `allowPrivateIPs` materially reduce protection. Keep
their default `false` values unless the deployment is isolated and the risk is
explicitly accepted.

## Deployment Checklist

- Require HTTPS at the ingress and for external services.
- Keep Vendure, this plugin, database drivers, and transitive dependencies on
  supported security patch levels.
- Disable GraphQL introspection and debug playgrounds where the production threat
  model requires it.
- Restrict database, object-storage, message-broker, and outbound-network access
  at infrastructure level.
- Review pipeline revisions before publishing and monitor failed runs, retries,
  webhook deliveries, and unusual outbound destinations.
- Back up the database, configuration, and encryption key, then test restoration.
- Rotate service credentials and review Vendure role assignments periodically.

## Contact

Security reports: **office@oronts.com**

General support: <https://oronts.com>

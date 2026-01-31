# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | Yes                |

## Reporting a Vulnerability

If you discover a security vulnerability in the Data Hub plugin, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email us at: **office@oronts.com**

Include the following in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

## Response Timeline

- We will acknowledge receipt within 48 hours
- We will provide an initial assessment within 7 days
- We will work with you to understand and resolve the issue

## Built-in Security Features

### SSRF Protection

The plugin includes comprehensive Server-Side Request Forgery (SSRF) protection in `src/utils/url-security.utils.ts`:

- **Private IP blocking**: Blocks requests to private networks (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
- **Loopback protection**: Blocks localhost and 127.x.x.x addresses
- **Cloud metadata protection**: Blocks AWS (169.254.169.254), GCP, and Azure metadata endpoints
- **IPv6 protection**: Blocks link-local (fe80::) and loopback (::1) addresses
- **DNS rebinding prevention**: Validates hostnames before making requests
- **Configurable allow/block lists**: Customize which hosts are allowed or blocked

### SQL Injection Prevention

The plugin includes SQL security utilities in `src/utils/sql-security.utils.ts`:

- **Column/table name validation**: Whitelist-based validation of SQL identifiers
- **Injection pattern detection**: Detects common SQL injection patterns
- **Identifier escaping**: Proper escaping of table and column names
- **Reserved word protection**: Prevents use of SQL reserved words as identifiers

### Code Sandboxing

Expression evaluation is sandboxed in `src/runtime/sandbox/safe-evaluator.ts`:

- **Whitelist-based validation**: Only allowed methods and operators can be used
- **No global access**: Prevents access to global objects (window, process, etc.)
- **Timeout enforcement**: Configurable execution timeouts prevent infinite loops
- **Prototype pollution prevention**: Blocks access to __proto__ and constructor
- **LRU caching**: Compiled expressions are cached for performance

### Permission Model

The plugin uses Vendure's permission system with 23 granular permissions:

- **Read permissions**: View pipelines, secrets, connections, runs, logs
- **Write permissions**: Create, update, delete pipelines, secrets, connections
- **Execute permissions**: Run pipelines, cancel runs, retry failed runs
- **Admin permissions**: Manage settings, view all data

## Security Best Practices

When using the Data Hub plugin:

1. **Secrets Management**
   - Use environment variables for sensitive credentials (`provider: 'ENV'`)
   - Never commit secrets to version control
   - Rotate API keys and passwords regularly

2. **Permissions**
   - Follow the principle of least privilege
   - Only grant necessary permissions to users
   - Review user access periodically

3. **Network Security**
   - Use HTTPS for all API connections
   - Configure firewalls to restrict database access
   - Use VPN or private networks for sensitive connections

4. **Data Handling**
   - Validate and sanitize all input data
   - Be cautious with data from external sources
   - Review pipeline definitions before running

5. **Pipeline Security**
   - Review custom expressions before enabling
   - Use the built-in validation before running pipelines
   - Monitor pipeline execution logs for anomalies

## Configuration Options

### URL Security

Configure allowed/blocked hosts in your pipeline connections:

```typescript
{
  config: {
    allowedHosts: ['api.trusted-partner.com'],
    blockedHosts: ['internal.company.com'],
    allowPrivateIPs: false, // default: false
  }
}
```

### Expression Sandbox

Configure sandbox limits in plugin options:

```typescript
DataHubPlugin.init({
  sandbox: {
    timeout: 5000,        // max execution time in ms
    maxIterations: 10000, // max loop iterations
  }
})
```

## Contact

For security concerns: office@oronts.com

For general support: https://oronts.com

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

## Security Best Practices

When using the Data Hub plugin:

1. **Secrets Management**
   - Use environment variables for sensitive credentials
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

## Contact

For security concerns: office@oronts.com

For general support: https://oronts.com

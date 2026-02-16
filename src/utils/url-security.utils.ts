// URL Security Utilities - SSRF Protection

import { URL } from 'url';
import * as dns from 'dns/promises';
import * as net from 'net';
import { getErrorMessage } from './error.utils';

export interface UrlSecurityConfig {
    disableSsrfProtection?: boolean;
    additionalBlockedHostnames?: string[];
    additionalBlockedRanges?: string[];
    allowedHostnames?: string[];
    allowPrivateIPs?: boolean;
}

export interface UrlSafetyResult {
    safe: boolean;
    reason?: string;
    resolvedIPs?: string[];
}

// Blocked IP ranges in CIDR notation (private/reserved ranges)
const BLOCKED_IP_RANGES = [
    '127.0.0.0/8',      // Loopback
    '10.0.0.0/8',       // Private (Class A)
    '172.16.0.0/12',    // Private (Class B)
    '192.168.0.0/16',   // Private (Class C)
    '169.254.0.0/16',   // Link-local (AWS/Azure/GCP metadata)
    '0.0.0.0/8',        // Current network
    '100.64.0.0/10',    // Shared address space (CGN)
    '192.0.0.0/24',     // IETF Protocol Assignments
    '192.0.2.0/24',     // TEST-NET-1
    '198.51.100.0/24',  // TEST-NET-2
    '203.0.113.0/24',   // TEST-NET-3
    '224.0.0.0/4',      // Multicast
    '240.0.0.0/4',      // Reserved
    '255.255.255.255/32', // Broadcast
];

const BLOCKED_IPV6_RANGES = [
    '::1/128',          // IPv6 loopback
    'fc00::/7',         // IPv6 private (Unique Local Addresses)
    'fe80::/10',        // IPv6 link-local
    '::ffff:0:0/96',    // IPv4-mapped IPv6
    '::ffff:127.0.0.0/104', // IPv4-mapped loopback
    '::ffff:10.0.0.0/104',  // IPv4-mapped private
    '::ffff:172.16.0.0/108', // IPv4-mapped private
    '::ffff:192.168.0.0/112', // IPv4-mapped private
    '::ffff:169.254.0.0/112', // IPv4-mapped link-local
    'ff00::/8',         // IPv6 multicast
];

// Cloud metadata service hostnames that should be blocked
const BLOCKED_HOSTNAMES = [
    'localhost',
    'localhost.localdomain',
    'metadata.google.internal',
    'metadata.goog',
    'metadata',
    'metadata.google.com',
    '169.254.169.254',  // AWS/Azure/GCP metadata IP
    'instance-data',     // AWS alias
    'metadata.azure.com',
    'metadata.azure.internal',
    'management.azure.com',
];

const ALLOWED_SCHEMES = ['http:', 'https:'];

function parseCIDR(cidr: string): { network: bigint; prefixLength: number; isIPv6: boolean } | null {
    const parts = cidr.split('/');
    if (parts.length !== 2) return null;

    const [ip, prefixStr] = parts;
    const prefixLength = parseInt(prefixStr, 10);
    const isIPv6 = ip.includes(':');

    try {
        const network = ipToNumber(ip, isIPv6);
        if (network === null) return null;
        return { network, prefixLength, isIPv6 };
    } catch {
        return null;
    }
}

function ipToNumber(ip: string, isIPv6: boolean): bigint | null {
    if (isIPv6) {
        return ipv6ToNumber(ip);
    }
    return ipv4ToNumber(ip);
}

function ipv4ToNumber(ip: string): bigint | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;

    let result = BigInt(0);
    for (const part of parts) {
        const num = parseInt(part, 10);
        if (isNaN(num) || num < 0 || num > 255) return null;
        result = (result << BigInt(8)) | BigInt(num);
    }
    return result;
}

function ipv6ToNumber(ip: string): bigint | null {
    // Expand :: notation
    let expanded = ip;
    if (ip.includes('::')) {
        const parts = ip.split('::');
        if (parts.length > 2) return null;

        const left = parts[0] ? parts[0].split(':') : [];
        const right = parts[1] ? parts[1].split(':') : [];
        const missing = 8 - left.length - right.length;

        if (missing < 0) return null;

        const middle = Array(missing).fill('0');
        expanded = [...left, ...middle, ...right].join(':');
    }

    const segments = expanded.split(':');
    if (segments.length !== 8) return null;

    let result = BigInt(0);
    for (const segment of segments) {
        const num = parseInt(segment || '0', 16);
        if (isNaN(num) || num < 0 || num > 0xffff) return null;
        result = (result << BigInt(16)) | BigInt(num);
    }
    return result;
}

function isIPInCIDR(ip: string, cidr: string): boolean {
    const isIPv6 = ip.includes(':');
    const parsed = parseCIDR(cidr);

    if (!parsed || parsed.isIPv6 !== isIPv6) return false;

    const ipNum = ipToNumber(ip, isIPv6);
    if (ipNum === null) return false;

    const bits = isIPv6 ? 128 : 32;
    const mask = ((BigInt(1) << BigInt(bits)) - BigInt(1)) ^ ((BigInt(1) << BigInt(bits - parsed.prefixLength)) - BigInt(1));

    return (ipNum & mask) === (parsed.network & mask);
}

export function isPrivateIP(ip: string): boolean {
    const isIPv6 = ip.includes(':');
    const ranges = isIPv6 ? BLOCKED_IPV6_RANGES : BLOCKED_IP_RANGES;

    for (const range of ranges) {
        if (isIPInCIDR(ip, range)) {
            return true;
        }
    }

    return false;
}

export function isBlockedHostname(hostname: string, additionalBlocked?: string[]): boolean {
    const normalizedHostname = hostname.toLowerCase().trim();

    // Check against default blocked hostnames
    for (const blocked of BLOCKED_HOSTNAMES) {
        if (normalizedHostname === blocked.toLowerCase()) {
            return true;
        }
    }

    // Check against additional blocked hostnames
    if (additionalBlocked) {
        for (const blocked of additionalBlocked) {
            if (normalizedHostname === blocked.toLowerCase()) {
                return true;
            }
        }
    }

    // Block hostnames that are IP addresses in private ranges
    if (net.isIP(normalizedHostname)) {
        return isPrivateIP(normalizedHostname);
    }

    return false;
}

/** SSRF protection: validates scheme, hostname blocklist, and DNS resolution */
export async function validateUrlSafety(
    url: string,
    config?: UrlSecurityConfig,
): Promise<UrlSafetyResult> {
    // If SSRF protection is disabled, allow all URLs
    if (config?.disableSsrfProtection) {
        return { safe: true };
    }

    // Parse URL
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return { safe: false, reason: 'Invalid URL format' };
    }

    // Check URL scheme
    if (!ALLOWED_SCHEMES.includes(parsedUrl.protocol)) {
        return {
            safe: false,
            reason: `URL scheme '${parsedUrl.protocol}' is not allowed. Only http and https are permitted.`,
        };
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // Check if hostname is in allowed list (bypass further checks)
    if (config?.allowedHostnames?.some(allowed => allowed.toLowerCase() === hostname)) {
        return { safe: true };
    }

    // Check against blocked hostnames
    if (isBlockedHostname(hostname, config?.additionalBlockedHostnames)) {
        return {
            safe: false,
            reason: `Hostname '${hostname}' is blocked for security reasons`,
        };
    }

    // If hostname is already an IP address, check directly
    if (net.isIP(hostname)) {
        if (!config?.allowPrivateIPs && isPrivateIP(hostname)) {
            return {
                safe: false,
                reason: `IP address '${hostname}' is in a private/reserved range`,
                resolvedIPs: [hostname],
            };
        }

        // Check additional blocked ranges
        if (config?.additionalBlockedRanges) {
            for (const range of config.additionalBlockedRanges) {
                if (isIPInCIDR(hostname, range)) {
                    return {
                        safe: false,
                        reason: `IP address '${hostname}' is in a blocked range`,
                        resolvedIPs: [hostname],
                    };
                }
            }
        }

        return { safe: true, resolvedIPs: [hostname] };
    }

    // Resolve hostname to IP addresses
    let resolvedIPs: string[];
    try {
        const addresses = await dns.lookup(hostname, { all: true });
        resolvedIPs = addresses.map(addr => addr.address);
    } catch (error) {
        // DNS resolution failure - could be a sign of DNS rebinding attack
        // or simply an invalid hostname
        return {
            safe: false,
            reason: `Failed to resolve hostname '${hostname}': ${getErrorMessage(error)}`,
        };
    }

    // Check all resolved IPs
    if (!config?.allowPrivateIPs) {
        for (const ip of resolvedIPs) {
            if (isPrivateIP(ip)) {
                return {
                    safe: false,
                    reason: `Hostname '${hostname}' resolves to private/reserved IP '${ip}'`,
                    resolvedIPs,
                };
            }
        }
    }

    // Check additional blocked ranges
    if (config?.additionalBlockedRanges) {
        for (const ip of resolvedIPs) {
            for (const range of config.additionalBlockedRanges) {
                if (isIPInCIDR(ip, range)) {
                    return {
                        safe: false,
                        reason: `Hostname '${hostname}' resolves to IP '${ip}' which is in a blocked range`,
                        resolvedIPs,
                    };
                }
            }
        }
    }

    return { safe: true, resolvedIPs };
}

/** Synchronous validation without DNS resolution (DNS rebinding attacks may bypass) */
export function validateUrlSafetySync(
    url: string,
    config?: UrlSecurityConfig,
): UrlSafetyResult {
    // If SSRF protection is disabled, allow all URLs
    if (config?.disableSsrfProtection) {
        return { safe: true };
    }

    // Parse URL
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return { safe: false, reason: 'Invalid URL format' };
    }

    // Check URL scheme
    if (!ALLOWED_SCHEMES.includes(parsedUrl.protocol)) {
        return {
            safe: false,
            reason: `URL scheme '${parsedUrl.protocol}' is not allowed. Only http and https are permitted.`,
        };
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // Check if hostname is in allowed list
    if (config?.allowedHostnames?.some(allowed => allowed.toLowerCase() === hostname)) {
        return { safe: true };
    }

    // Check against blocked hostnames
    if (isBlockedHostname(hostname, config?.additionalBlockedHostnames)) {
        return {
            safe: false,
            reason: `Hostname '${hostname}' is blocked for security reasons`,
        };
    }

    // If hostname is an IP address, check directly
    if (net.isIP(hostname)) {
        if (!config?.allowPrivateIPs && isPrivateIP(hostname)) {
            return {
                safe: false,
                reason: `IP address '${hostname}' is in a private/reserved range`,
            };
        }
    }

    // Note: Cannot check DNS resolution synchronously
    // This is a limitation - async validation is preferred
    return { safe: true };
}

export async function assertUrlSafe(url: string, config?: UrlSecurityConfig): Promise<void> {
    const result = await validateUrlSafety(url, config);
    if (!result.safe) {
        throw new Error(`SSRF protection: ${result.reason}`);
    }
}


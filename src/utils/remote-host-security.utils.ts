import { createHash, timingSafeEqual } from 'crypto';
import { lookup } from 'dns/promises';
import { isIP, Socket, type LookupFunction } from 'net';
import { SECRET_SECURITY } from '../constants/defaults/security-defaults';
import { validateUrlSafety } from './url-security.utils';

const MAX_HOSTNAME_LENGTH = 253;
const SFTP_FINGERPRINT_PATTERN = /^SHA256:([A-Za-z0-9+/]{43})$/;

export interface SafeRemoteAddress {
    hostname: string;
    address: string;
    family: 4 | 6;
}

export type SafeRemoteAddresses = readonly [
    SafeRemoteAddress,
    ...SafeRemoteAddress[],
];

export function createPinnedLookup(remote: SafeRemoteAddress): LookupFunction {
    return createPinnedAddressLookup([remote]);
}

export function createPinnedAddressLookup(
    remotes: SafeRemoteAddresses,
): LookupFunction {
    const expectedHostname = remotes[0].hostname;
    if (remotes.some(remote => remote.hostname !== expectedHostname)) {
        throw new Error('Pinned remote addresses must use one hostname');
    }

    return (hostname, options, callback): void => {
        let requestedHostname: string;
        try {
            requestedHostname = normalizeRemoteHostname(hostname);
        } catch (error) {
            callback(error as Error, '', 0);
            return;
        }
        if (requestedHostname !== expectedHostname) {
            callback(
                new Error(
                    `SSRF protection: refusing hostname change from ${expectedHostname} to ${requestedHostname}`,
                ),
                '',
                0,
            );
            return;
        }

        const requestedFamily = options.family === 'IPv4'
            ? 4
            : options.family === 'IPv6'
                ? 6
                : options.family ?? 0;
        const matchingRemotes = requestedFamily === 0
            ? remotes
            : remotes.filter(remote => remote.family === requestedFamily);
        if (matchingRemotes.length === 0) {
            callback(
                new Error(
                    `SSRF protection: validated ${expectedHostname} addresses do not match requested IP family`,
                ),
                '',
                0,
            );
            return;
        }
        if (options.all) {
            callback(
                null,
                matchingRemotes.map(remote => ({
                    address: remote.address,
                    family: remote.family,
                })),
            );
            return;
        }
        callback(
            null,
            matchingRemotes[0].address,
            matchingRemotes[0].family,
        );
    };
}

function remoteValidationUrl(hostname: string): string {
    return `http://${isIP(hostname) === 6 ? `[${hostname}]` : hostname}/`;
}

export function normalizeRemoteHostname(host: string): string {
    if (typeof host !== 'string' || host.length === 0 || host !== host.trim()) {
        throw new Error('Remote host must be a non-empty hostname without surrounding whitespace');
    }
    if (host.length > MAX_HOSTNAME_LENGTH) {
        throw new Error(`Remote host exceeds ${MAX_HOSTNAME_LENGTH} characters`);
    }
    const hasControlCharacter = [...host].some(character => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 32 || codePoint === 127;
    });
    const hasUrlSyntax = ['@', '/', '\\', '?', '#'].some(character => host.includes(character));
    if (hasControlCharacter || hasUrlSyntax) {
        throw new Error('Remote host must not contain credentials, URL syntax, whitespace, or control characters');
    }
    if (host.startsWith('[') || host.endsWith(']')) {
        throw new Error('Remote host IPv6 addresses must not include brackets');
    }
    if (host.includes(':') && isIP(host) !== 6) {
        throw new Error('Remote host must not include a port or URL scheme');
    }

    const url = new URL(remoteValidationUrl(host));
    const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!hostname) {
        throw new Error('Remote host is invalid');
    }
    return hostname;
}

export async function resolveSafeRemoteAddresses(
    host: string,
): Promise<SafeRemoteAddresses> {
    const hostname = normalizeRemoteHostname(host);
    const safety = await validateUrlSafety(remoteValidationUrl(hostname));
    if (!safety.safe) {
        throw new Error(`SSRF protection: ${safety.reason ?? 'remote host is blocked'}`);
    }

    const resolvedAddresses = safety.resolvedIPs?.length
        ? safety.resolvedIPs
        : (await lookup(hostname, { all: true })).map(result => result.address);
    const remotes: SafeRemoteAddress[] = [];
    const seenAddresses = new Set<string>();
    for (const address of resolvedAddresses) {
        const family = isIP(address);
        if ((family !== 4 && family !== 6) || seenAddresses.has(address)) {
            continue;
        }
        seenAddresses.add(address);
        remotes.push({ hostname, address, family });
    }
    if (remotes.length === 0) {
        throw new Error(`Remote host '${hostname}' did not resolve to a valid IP address`);
    }

    return [remotes[0], ...remotes.slice(1)];
}

export async function resolveSafeRemoteAddress(host: string): Promise<SafeRemoteAddress> {
    const remotes = await resolveSafeRemoteAddresses(host);
    return remotes[0];
}

export async function connectPinnedRemoteSocket(
    host: string,
    port: number,
    timeoutMs: number,
): Promise<{ socket: Socket; remote: SafeRemoteAddress }> {
    const remote = await resolveSafeRemoteAddress(host);
    const socket = new Socket();

    await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
            socket.removeListener('connect', onConnect);
            socket.removeListener('error', onError);
            socket.removeListener('timeout', onTimeout);
        };
        const onConnect = (): void => {
            cleanup();
            socket.setTimeout(0);
            if (socket.remoteAddress !== remote.address) {
                socket.destroy();
                reject(new Error('SSRF protection: connected remote address did not match the validated address'));
                return;
            }
            resolve();
        };
        const onError = (error: Error): void => {
            cleanup();
            socket.destroy();
            reject(error);
        };
        const onTimeout = (): void => {
            cleanup();
            socket.destroy();
            reject(new Error(`Remote connection timed out after ${timeoutMs}ms`));
        };

        socket.once('connect', onConnect);
        socket.once('error', onError);
        socket.once('timeout', onTimeout);
        socket.setTimeout(timeoutMs);
        socket.connect({ host: remote.address, port, family: remote.family });
    });

    return { socket, remote };
}

export function isProductionEnvironment(): boolean {
    return process.env[SECRET_SECURITY.NODE_ENV]?.trim().toLowerCase() ===
        SECRET_SECURITY.PRODUCTION_ENV;
}

export function createSftpHostVerifier(
    configuredFingerprint: string | undefined,
    production = isProductionEnvironment(),
): ((hostKey: Buffer) => boolean) | undefined {
    const fingerprint = configuredFingerprint?.trim();
    if (!fingerprint) {
        if (production) {
            throw new Error('SFTP host-key fingerprint is required in production');
        }
        return undefined;
    }
    if (!SFTP_FINGERPRINT_PATTERN.test(fingerprint)) {
        throw new Error('SFTP host-key fingerprint must use the OpenSSH SHA256:<base64> format');
    }

    return (hostKey: Buffer): boolean => {
        const actual = `SHA256:${createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '')}`;
        const actualBuffer = Buffer.from(actual);
        const expectedBuffer = Buffer.from(fingerprint);
        return actualBuffer.length === expectedBuffer.length &&
            timingSafeEqual(actualBuffer, expectedBuffer);
    };
}

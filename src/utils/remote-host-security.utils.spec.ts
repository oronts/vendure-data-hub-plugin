import { createHash } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateUrlSafety } from './url-security.utils';
import {
    createPinnedLookup,
    createPinnedAddressLookup,
    createSftpHostVerifier,
    normalizeRemoteHostname,
    resolveSafeRemoteAddress,
    resolveSafeRemoteAddresses,
} from './remote-host-security.utils';

function executeLookup(hostname: string): Promise<{ address: string; family: number }> {
    const lookup = createPinnedLookup({
        hostname: 'files.example.com',
        address: '203.0.114.8',
        family: 4,
    });
    return new Promise((resolve, reject) => {
        lookup(hostname, { family: 0, all: false }, (error, address, family) => {
            if (error) {
                reject(error);
            } else if (Array.isArray(address) || family === undefined) {
                reject(new Error('Expected one pinned lookup address'));
            } else {
                resolve({ address, family });
            }
        });
    });
}

vi.mock('./url-security.utils', () => ({
    validateUrlSafety: vi.fn(),
}));

describe('remote host transport security', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        'user:pass@example.com',
        'example.com:22',
        'sftp://example.com',
        'example.com/path',
        ' example.com',
    ])('rejects host values containing URL or credential syntax: %s', host => {
        expect(() => normalizeRemoteHostname(host)).toThrow(/Remote host/);
    });

    it('returns the exact address approved by full DNS-aware SSRF validation', async () => {
        vi.mocked(validateUrlSafety).mockResolvedValue({
            safe: true,
            resolvedIPs: ['203.0.114.8', '203.0.114.9'],
        });

        await expect(resolveSafeRemoteAddress('files.example.com')).resolves.toEqual({
            hostname: 'files.example.com',
            address: '203.0.114.8',
            family: 4,
        });
    });

    it('preserves every unique approved address for pinned failover', async () => {
        vi.mocked(validateUrlSafety).mockResolvedValue({
            safe: true,
            resolvedIPs: ['2001:db8::8', '203.0.114.8', '203.0.114.8'],
        });

        await expect(resolveSafeRemoteAddresses('files.example.com')).resolves.toEqual([
            {
                hostname: 'files.example.com',
                address: '2001:db8::8',
                family: 6,
            },
            {
                hostname: 'files.example.com',
                address: '203.0.114.8',
                family: 4,
            },
        ]);
    });

    it('returns all pinned addresses requested by Node family auto-selection', async () => {
        const lookup = createPinnedAddressLookup([
            { hostname: 'files.example.com', address: '2001:db8::8', family: 6 },
            { hostname: 'files.example.com', address: '203.0.114.8', family: 4 },
        ]);

        const addresses = await new Promise<unknown>((resolve, reject) => {
            lookup('files.example.com', { all: true }, (error, result) => {
                if (error) reject(error);
                else resolve(result);
            });
        });
        expect(addresses).toEqual([
            { address: '2001:db8::8', family: 6 },
            { address: '203.0.114.8', family: 4 },
        ]);
    });

    it('pins transport lookup to the validated address and rejects hostname changes', async () => {
        await expect(executeLookup('files.example.com')).resolves.toEqual({
            address: '203.0.114.8',
            family: 4,
        });
        await expect(executeLookup('redirect.example.com')).rejects.toThrow(
            'refusing hostname change',
        );
    });

    it('fails closed when DNS-aware SSRF validation rejects an address', async () => {
        vi.mocked(validateUrlSafety).mockResolvedValue({
            safe: false,
            reason: "Hostname 'internal.example' resolves to private/reserved IP '10.0.0.5'",
        });

        await expect(resolveSafeRemoteAddress('internal.example')).rejects.toThrow(
            /resolves to private\/reserved IP/,
        );
    });

    it('verifies OpenSSH SHA256 host-key fingerprints', () => {
        const hostKey = Buffer.from('test-server-host-key');
        const fingerprint = `SHA256:${createHash('sha256')
            .update(hostKey)
            .digest('base64')
            .replace(/=+$/, '')}`;
        const verifier = createSftpHostVerifier(fingerprint, true);

        expect(verifier?.(hostKey)).toBe(true);
        expect(verifier?.(Buffer.from('different-host-key'))).toBe(false);
    });

    it('requires a verifiable host-key fingerprint in production', () => {
        expect(() => createSftpHostVerifier(undefined, true)).toThrow(
            'SFTP host-key fingerprint is required in production',
        );
        expect(() => createSftpHostVerifier('SHA256:not-a-fingerprint', false)).toThrow(
            'OpenSSH SHA256:<base64> format',
        );
    });
});

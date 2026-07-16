import { createHash } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateUrlSafety } from './url-security.utils';
import {
    createSftpHostVerifier,
    normalizeRemoteHostname,
    resolveSafeRemoteAddress,
} from './remote-host-security.utils';

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

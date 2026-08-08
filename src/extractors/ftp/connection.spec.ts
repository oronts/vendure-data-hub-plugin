import { describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { buildFtpConnectionOptions, buildSftpConnectionOptions } from './connection';
import type { FtpExtractorConfig } from './types';

const secrets = {
    get: vi.fn(async (code: string) => ({
        'sftp-private-key': 'runtime-private-key',
        'sftp-host-key': 'SHA256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })[code]),
};
const context = { secrets } as unknown as ExtractorContext;

const baseConfig: FtpExtractorConfig = {
    protocol: 'sftp',
    host: 'sftp.example.com',
    username: 'catalog',
    remotePath: '/imports',
};

describe('FTP/SFTP extractor credential contracts', () => {
    it('resolves the host-key fingerprint from a Secret Code only at connection time', async () => {
        await expect(buildSftpConnectionOptions(context, {
            ...baseConfig,
            privateKeySecretCode: 'sftp-private-key',
            hostKeyFingerprintSecretCode: 'sftp-host-key',
        })).resolves.toMatchObject({
            privateKey: 'runtime-private-key',
            hostKeyFingerprint: 'SHA256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        });
        expect(secrets.get).toHaveBeenCalledWith('sftp-host-key');
    });

    it.each(['password', 'privateKey', 'passphrase', 'hostKeyFingerprint'])(
        'rejects raw %s fields even when supplied outside the TypeScript contract',
        async field => {
            const malicious = { ...baseConfig, protocol: 'ftp', [field]: 'raw-value' } as unknown as FtpExtractorConfig;
            await expect(buildFtpConnectionOptions(context, malicious)).rejects.toThrow(
                `FTP/SFTP field "${field}" must use a Secret Code reference`,
            );
        },
    );

    it('rejects embedded credentials in the host before resolving any secret', async () => {
        await expect(buildSftpConnectionOptions(context, {
            ...baseConfig,
            host: 'user:password@sftp.example.com',
        })).rejects.toThrow(/must not contain credentials/);
    });
});

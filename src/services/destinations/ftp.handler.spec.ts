import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedFTPDestinationConfig, ResolvedSFTPDestinationConfig } from './destination.types';
import {
    deliverToFTP,
    deliverToSFTP,
    testFtpDestination,
} from './ftp.handler';
import {
    connectPinnedRemoteSocket,
    createSftpHostVerifier,
    resolveSafeRemoteAddress,
} from '../../utils/remote-host-security.utils';

const clients = vi.hoisted(() => ({
    ftpAccess: vi.fn(),
    ftpEnsureDir: vi.fn(),
    ftpUploadFrom: vi.fn(),
    ftpCd: vi.fn(),
    ftpClose: vi.fn(),
    sftpConnect: vi.fn(),
    sftpMkdir: vi.fn(),
    sftpPut: vi.fn(),
    sftpEnd: vi.fn(),
}));

vi.mock('basic-ftp', () => ({
    Client: class {
        readonly ftp = { verbose: false };
        access = clients.ftpAccess;
        ensureDir = clients.ftpEnsureDir;
        uploadFrom = clients.ftpUploadFrom;
        cd = clients.ftpCd;
        close = clients.ftpClose;
    },
}));

vi.mock('ssh2-sftp-client', () => ({
    default: class {
        connect = clients.sftpConnect;
        mkdir = clients.sftpMkdir;
        put = clients.sftpPut;
        end = clients.sftpEnd;
    },
}));

vi.mock('../../utils/remote-host-security.utils', () => ({
    resolveSafeRemoteAddress: vi.fn(),
    connectPinnedRemoteSocket: vi.fn(),
    createSftpHostVerifier: vi.fn(),
}));

const ftpConfig: ResolvedFTPDestinationConfig = {
    id: 'partner-ftp',
    name: 'Partner FTP',
    type: 'FTP',
    host: 'ftp.example.com',
    port: 21,
    username: 'catalog',
    password: 'runtime-password',
    remotePath: '/exports',
    secure: true,
};

const sftpConfig: ResolvedSFTPDestinationConfig = {
    id: 'partner-sftp',
    name: 'Partner SFTP',
    type: 'SFTP',
    host: 'sftp.example.com',
    port: 22,
    username: 'catalog',
    privateKey: 'runtime-private-key',
    hostKeyFingerprint: 'SHA256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    remotePath: '/exports',
};

describe('FTP/SFTP destination transport security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clients.ftpAccess.mockResolvedValue(undefined);
        clients.ftpEnsureDir.mockResolvedValue(undefined);
        clients.ftpUploadFrom.mockResolvedValue(undefined);
        clients.ftpCd.mockResolvedValue(undefined);
        clients.sftpConnect.mockResolvedValue(undefined);
        clients.sftpMkdir.mockResolvedValue(undefined);
        clients.sftpPut.mockResolvedValue(undefined);
        clients.sftpEnd.mockResolvedValue(undefined);
        vi.mocked(resolveSafeRemoteAddress).mockResolvedValue({
            hostname: ftpConfig.host,
            address: '203.0.114.10',
            family: 4,
        });
    });

    it('pins FTPS to the validated address while verifying the original hostname', async () => {
        const result = await deliverToFTP(ftpConfig, Buffer.from('catalog'), 'catalog.csv');

        expect(result.success).toBe(true);
        expect(clients.ftpAccess).toHaveBeenCalledWith(expect.objectContaining({
            host: '203.0.114.10',
            secure: true,
            secureOptions: {
                rejectUnauthorized: true,
                servername: 'ftp.example.com',
            },
        }));
    });

    it('passes the pinned socket and strict host-key verifier to ssh2', async () => {
        const socket = { destroy: vi.fn() };
        const hostVerifier = vi.fn(() => true);
        vi.mocked(connectPinnedRemoteSocket).mockResolvedValue({
            socket: socket as never,
            remote: {
                hostname: sftpConfig.host,
                address: '203.0.114.11',
                family: 4,
            },
        });
        vi.mocked(createSftpHostVerifier).mockReturnValue(hostVerifier);

        const result = await deliverToSFTP(sftpConfig, Buffer.from('catalog'), 'catalog.csv');

        expect(result.success).toBe(true);
        expect(createSftpHostVerifier).toHaveBeenCalledWith(sftpConfig.hostKeyFingerprint);
        expect(clients.sftpConnect).toHaveBeenCalledWith(expect.objectContaining({
            sock: socket,
            hostVerifier,
            retries: 0,
        }));
    });

    it('reports a failed connectivity test when the protected connection cannot open', async () => {
        vi.mocked(resolveSafeRemoteAddress).mockRejectedValue(
            new Error('SSRF protection: blocked address'),
        );

        await expect(testFtpDestination(ftpConfig, Date.now())).resolves.toMatchObject({
            success: false,
            message: 'SSRF protection: blocked address',
        });
        expect(clients.ftpCd).not.toHaveBeenCalled();
    });
});

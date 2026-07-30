import { createHash } from 'node:crypto';
import { Client as SshClient } from 'ssh2';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { FileParserService } from '../../parsers/file-parser.service';
import { configureGlobalSsrfProtection } from '../../utils/url-security.utils';
import {
    deliverToFTP,
    deliverToSFTP,
    testFtpDestination,
    testSftpDestination,
} from '../../services/destinations/ftp.handler';
import type {
    ResolvedFTPDestinationConfig,
    ResolvedSFTPDestinationConfig,
} from '../../services/destinations/destination.types';
import { createClient } from './connection';
import { FtpExtractor } from './ftp.extractor';
import type { FtpExtractorConfig } from './types';

const ftp = readProtocolEnvironment('FTP');
const sftp = readProtocolEnvironment('SFTP');
const integrationDescribe = ftp && sftp ? describe : describe.skip;

integrationDescribe('FTP and SFTP transport integration', () => {
    const runDirectory = `integration-${process.pid}-${Date.now()}`;
    let sftpFingerprint = '';

    beforeAll(async () => {
        configureGlobalSsrfProtection({ allowedHostnames: ['127.0.0.1'] });
        sftpFingerprint = await discoverSftpFingerprint(sftp as ProtocolEnvironment);
    });

    afterAll(() => {
        configureGlobalSsrfProtection({});
    });

    it('round-trips a CSV through the FTP destination and extractor', async () => {
        const environment = ftp as ProtocolEnvironment;
        const remotePath = `/home/datahub/${runDirectory}/ftp`;
        const destination: ResolvedFTPDestinationConfig = {
            id: 'ftp-integration',
            name: 'FTP integration',
            type: 'FTP',
            host: environment.host,
            port: environment.port,
            username: environment.username,
            password: environment.password,
            remotePath,
        };

        await expect(testFtpDestination(
            { ...destination, remotePath: '/' },
            Date.now(),
        )).resolves.toMatchObject({ success: true });
        await expect(deliverToFTP(
            destination,
            Buffer.from('sku,name\nFTP-1,FTP Product\n'),
            'products.csv',
        )).resolves.toMatchObject({ success: true });

        await expect(extractCsv(
            createContext({
                'ftp-password': environment.password,
            }),
            {
                protocol: 'ftp',
                host: environment.host,
                port: environment.port,
                username: environment.username,
                passwordSecretCode: 'ftp-password',
                remotePath,
                filePattern: '*.csv',
                format: 'CSV',
            },
        )).resolves.toEqual([{ sku: 'FTP-1', name: 'FTP Product' }]);

        await deleteRemoteFile(createContext({
            'ftp-password': environment.password,
        }), {
            protocol: 'ftp',
            host: environment.host,
            port: environment.port,
            username: environment.username,
            passwordSecretCode: 'ftp-password',
            remotePath,
        }, `${remotePath}/products.csv`);
    });

    it('round-trips a CSV through the SFTP destination with host-key pinning', async () => {
        const environment = sftp as ProtocolEnvironment;
        const remotePath = `/upload/${runDirectory}`;
        const destination: ResolvedSFTPDestinationConfig = {
            id: 'sftp-integration',
            name: 'SFTP integration',
            type: 'SFTP',
            host: environment.host,
            port: environment.port,
            username: environment.username,
            password: environment.password,
            hostKeyFingerprint: sftpFingerprint,
            remotePath,
        };

        await expect(testSftpDestination(
            { ...destination, remotePath: '/upload' },
            Date.now(),
        )).resolves.toMatchObject({ success: true });
        await expect(deliverToSFTP(
            destination,
            Buffer.from('sku,name\nSFTP-1,SFTP Product\n'),
            'products.csv',
        )).resolves.toMatchObject({ success: true });

        const context = createContext({
            'sftp-password': environment.password,
            'sftp-host-key': sftpFingerprint,
        });
        const config: FtpExtractorConfig = {
            protocol: 'sftp',
            host: environment.host,
            port: environment.port,
            username: environment.username,
            passwordSecretCode: 'sftp-password',
            hostKeyFingerprintSecretCode: 'sftp-host-key',
            remotePath,
            filePattern: '*.csv',
            format: 'CSV',
        };
        await expect(extractCsv(context, config))
            .resolves.toEqual([{ sku: 'SFTP-1', name: 'SFTP Product' }]);

        const invalidFingerprint = `SHA256:${Buffer.alloc(32).toString('base64').replace(/=+$/, '')}`;
        await expect(testSftpDestination({
            ...destination,
            hostKeyFingerprint: invalidFingerprint,
        }, Date.now())).resolves.toMatchObject({ success: false });

        await deleteRemoteFile(context, config, `${remotePath}/products.csv`);
    });
});

interface ProtocolEnvironment {
    readonly host: string;
    readonly port: number;
    readonly username: string;
    readonly password: string;
}

function readProtocolEnvironment(
    protocol: 'FTP' | 'SFTP',
): ProtocolEnvironment | undefined {
    const host = process.env[`DATAHUB_TEST_${protocol}_HOST`]?.trim();
    const port = Number(process.env[`DATAHUB_TEST_${protocol}_PORT`]);
    const username = process.env[`DATAHUB_TEST_${protocol}_USERNAME`]?.trim();
    const password = process.env[`DATAHUB_TEST_${protocol}_PASSWORD`];
    if (!host || !Number.isInteger(port) || port < 1 || !username || !password) {
        return undefined;
    }
    return { host, port, username, password };
}

function createContext(secretValues: Readonly<Record<string, string>>): ExtractorContext {
    return {
        checkpoint: { data: {} },
        connections: {
            get: vi.fn(),
            getRequired: vi.fn(),
        },
        secrets: {
            get: vi.fn(async code => secretValues[code]),
            getRequired: vi.fn(async code => {
                const value = secretValues[code];
                if (!value) throw new Error(`Missing secret ${code}`);
                return value;
            }),
        },
        logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
        setCheckpoint: vi.fn(),
        isCancelled: vi.fn(async () => false),
    } as unknown as ExtractorContext;
}

async function extractCsv(
    context: ExtractorContext,
    config: FtpExtractorConfig,
): Promise<unknown[]> {
    const extractor = new FtpExtractor(new FileParserService());
    const records = [];
    for await (const record of extractor.extract(context, config)) {
        records.push(record.data);
    }
    return records;
}

async function deleteRemoteFile(
    context: ExtractorContext,
    config: FtpExtractorConfig,
    remotePath: string,
): Promise<void> {
    const client = await createClient(context, config);
    try {
        await client.delete(remotePath);
    } finally {
        await client.close();
    }
}

async function discoverSftpFingerprint(
    environment: ProtocolEnvironment,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const client = new SshClient();
        let fingerprint: string | undefined;
        client.once('ready', () => {
            client.end();
            if (!fingerprint) {
                reject(new Error('SFTP server did not provide a host key'));
                return;
            }
            resolve(fingerprint);
        });
        client.once('error', reject);
        client.connect({
            host: environment.host,
            port: environment.port,
            username: environment.username,
            password: environment.password,
            hostVerifier: (hostKey: Buffer) => {
                fingerprint = `SHA256:${createHash('sha256')
                    .update(hostKey)
                    .digest('base64')
                    .replace(/=+$/, '')}`;
                return true;
            },
        });
    });
}

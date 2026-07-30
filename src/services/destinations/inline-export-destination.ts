import type { DestinationConfig, DestinationType } from './destination.types';
import { parseDestinationConfig } from './destination-config.validation';

type ExportConfig = Record<string, unknown>;

export const PIPELINE_EXPORT_DESTINATION_TYPES = [
    'LOCAL',
    'HTTP',
    'S3',
    'SFTP',
    'FTP',
    'EMAIL',
] as const satisfies readonly DestinationType[];

const SUPPORTED_TYPES = new Set<string>(PIPELINE_EXPORT_DESTINATION_TYPES);

function baseDestination(stepKey: string, type: DestinationType) {
    return {
        id: `pipeline:${stepKey}`,
        name: `Pipeline export ${stepKey}`,
        type,
        enabled: true,
    } as const;
}

export function parseInlineExportDestination(
    stepKey: string,
    config: ExportConfig,
): DestinationConfig | undefined {
    const rawType = config.destinationType;
    if (rawType === undefined || rawType === null || rawType === '') {
        return undefined;
    }
    if (typeof rawType !== 'string' || !SUPPORTED_TYPES.has(rawType)) {
        throw new Error(`Unsupported pipeline export destination type "${String(rawType)}"`);
    }

    const type = rawType as DestinationType;
    const base = baseDestination(stepKey, type);
    switch (type) {
        case 'LOCAL':
            return parseDestinationConfig({
                ...base,
                directory: config.directory,
            });
        case 'HTTP':
            return parseDestinationConfig({
                ...base,
                url: config.url,
                method: config.method,
                headers: config.headers,
                headerSecretCodes: config.headerSecretCodes,
                auth: config.auth,
            });
        case 'S3':
            return parseDestinationConfig({
                ...base,
                bucket: config.bucket,
                region: config.region,
                accessKeyIdSecretCode: config.accessKeyIdSecretCode,
                secretAccessKeySecretCode: config.secretAccessKeySecretCode,
                prefix: config.prefix,
                acl: config.acl,
                endpoint: config.endpoint,
            });
        case 'SFTP':
            return parseDestinationConfig({
                ...base,
                host: config.host,
                port: config.port,
                username: config.username,
                passwordSecretCode: config.passwordSecretCode,
                privateKeySecretCode: config.privateKeySecretCode,
                passphraseSecretCode: config.passphraseSecretCode,
                hostKeyFingerprintSecretCode: config.hostKeyFingerprintSecretCode,
                remotePath: config.remotePath,
                timeout: config.timeout,
            });
        case 'FTP':
            return parseDestinationConfig({
                ...base,
                host: config.host,
                port: config.port,
                username: config.username,
                passwordSecretCode: config.passwordSecretCode,
                remotePath: config.remotePath,
                secure: config.secure,
            });
        case 'EMAIL':
            return parseDestinationConfig({
                ...base,
                to: config.to,
                cc: config.cc,
                bcc: config.bcc,
                from: config.from,
                subject: config.subject,
                body: config.body,
                smtp: config.smtp,
            });
    }
}

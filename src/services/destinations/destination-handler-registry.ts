import type { ConnectionTestResult } from '../../../shared/types';
import { HTTP } from '../../constants';
import { secureFetch } from '../../utils/secure-fetch.utils';
import { assertUrlSafe } from '../../utils/url-security.utils';
import {
    DeliveryOptions,
    DeliveryResult,
    DESTINATION_TYPE,
    LocalDestinationConfig,
    ResolvedDestinationConfig,
    ResolvedEmailDestinationConfig,
    ResolvedFTPDestinationConfig,
    ResolvedHTTPDestinationConfig,
    ResolvedS3DestinationConfig,
    ResolvedSFTPDestinationConfig,
} from './destination.types';
import { deliverToEmail, testEmailDestination } from './email.handler';
import {
    deliverToFTP,
    deliverToSFTP,
    testFtpDestination,
    testSftpDestination,
} from './ftp.handler';
import {
    deliverToHTTP,
    getHttpDestinationAuthHeaders,
} from './http.handler';
import { deliverToLocal, testLocalDestination } from './local.handler';
import { deliverToS3, testS3Destination } from './s3.handler';

export type DeliverFn = (
    config: ResolvedDestinationConfig,
    buffer: Buffer,
    filename: string,
    options?: DeliveryOptions,
) => Promise<DeliveryResult>;
export type TestFn = (
    config: ResolvedDestinationConfig,
    start: number,
) => Promise<ConnectionTestResult>;

export const DESTINATION_DELIVERY_REGISTRY: ReadonlyMap<string, DeliverFn> =
    new Map<string, DeliverFn>([
        [
            DESTINATION_TYPE.S3,
            (config, buffer, filename, options) =>
                deliverToS3(
                    config as ResolvedS3DestinationConfig,
                    buffer,
                    filename,
                    options,
                ),
        ],
        [
            DESTINATION_TYPE.SFTP,
            (config, buffer, filename, options) =>
                deliverToSFTP(
                    config as ResolvedSFTPDestinationConfig,
                    buffer,
                    filename,
                    options,
                ),
        ],
        [
            DESTINATION_TYPE.FTP,
            (config, buffer, filename, options) =>
                deliverToFTP(
                    config as ResolvedFTPDestinationConfig,
                    buffer,
                    filename,
                    options,
                ),
        ],
        [
            DESTINATION_TYPE.HTTP,
            (config, buffer, filename, options) =>
                deliverToHTTP(
                    config as ResolvedHTTPDestinationConfig,
                    buffer,
                    filename,
                    options,
                ),
        ],
        [
            DESTINATION_TYPE.LOCAL,
            (config, buffer, filename, options) =>
                deliverToLocal(
                    config as LocalDestinationConfig,
                    buffer,
                    filename,
                    options,
                ),
        ],
        [
            DESTINATION_TYPE.EMAIL,
            (config, buffer, filename, options) =>
                deliverToEmail(
                    config as ResolvedEmailDestinationConfig,
                    buffer,
                    filename,
                    options,
                ),
        ],
    ]);

export const DESTINATION_TEST_REGISTRY: ReadonlyMap<string, TestFn> =
    new Map<string, TestFn>([
        [
            DESTINATION_TYPE.S3,
            (config, start) => testS3Destination(
                config as ResolvedS3DestinationConfig,
                start,
            ),
        ],
        [
            DESTINATION_TYPE.SFTP,
            (config, start) => testSftpDestination(
                config as ResolvedSFTPDestinationConfig,
                start,
            ),
        ],
        [
            DESTINATION_TYPE.FTP,
            (config, start) => testFtpDestination(
                config as ResolvedFTPDestinationConfig,
                start,
            ),
        ],
        [
            DESTINATION_TYPE.HTTP,
            async (config, start) => {
                const httpConfig = config as ResolvedHTTPDestinationConfig;
                await assertUrlSafe(httpConfig.url);
                const response = await secureFetch(
                    httpConfig.url,
                    {
                        method: 'HEAD',
                        headers: {
                            ...httpConfig.headers,
                            ...getHttpDestinationAuthHeaders(httpConfig),
                        },
                        signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
                    },
                );
                await response.body?.cancel().catch(() => undefined);
                if (response.ok) {
                    return {
                        success: true,
                        message: `HTTP endpoint reachable (${response.status})`,
                        latencyMs: Date.now() - start,
                    };
                }
                return {
                    success: false,
                    message: `HTTP endpoint returned ${response.status}`,
                    latencyMs: Date.now() - start,
                };
            },
        ],
        [
            DESTINATION_TYPE.LOCAL,
            async (config, start) => {
                const result = await testLocalDestination(
                    config as LocalDestinationConfig,
                );
                return { ...result, latencyMs: Date.now() - start };
            },
        ],
        [
            DESTINATION_TYPE.EMAIL,
            (config, start) => testEmailDestination(
                config as ResolvedEmailDestinationConfig,
                start,
            ),
        ],
    ]);

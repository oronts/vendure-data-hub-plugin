/**
 * Destination Handler Registry
 *
 * Single source of truth for the mapping between DESTINATION_TYPE values and handler functions.
 * The ExportDestinationService references this registry for delivery and test dispatch,
 * eliminating the need to maintain handler maps inline.
 *
 * To add a new destination handler:
 * 1. Create the handler file in this directory (e.g., my-destination.handler.ts)
 * 2. Add the DESTINATION_TYPE entry in shared/constants/enums.ts
 * 3. Add the entry to DESTINATION_DELIVERY_REGISTRY (and optionally DESTINATION_TEST_REGISTRY) below
 * That's it - no changes needed in export-destination.service.ts.
 */
import type { ConnectionTestResult } from '../../../shared/types';
import {
    DestinationConfig,
    DeliveryResult,
    DeliveryOptions,
    S3DestinationConfig,
    SFTPDestinationConfig,
    FTPDestinationConfig,
    HTTPDestinationConfig,
    LocalDestinationConfig,
    EmailDestinationConfig,
    DESTINATION_TYPE,
} from './destination.types';
import { deliverToS3 } from './s3.handler';
import { deliverToHTTP } from './http.handler';
import { deliverToLocal, testLocalDestination } from './local.handler';
import { deliverToSFTP, deliverToFTP } from './ftp.handler';
import { deliverToEmail } from './email.handler';
import { assertUrlSafe } from '../../utils/url-security.utils';

export type DeliverFn = (config: DestinationConfig, buffer: Buffer, filename: string, options?: DeliveryOptions) => Promise<DeliveryResult>;
export type TestFn = (config: DestinationConfig, start: number) => Promise<ConnectionTestResult>;

/**
 * Maps each DESTINATION_TYPE to its corresponding delivery handler function.
 * Used by ExportDestinationService for dispatch.
 */
export const DESTINATION_DELIVERY_REGISTRY: ReadonlyMap<string, DeliverFn> = new Map<string, DeliverFn>([
    [DESTINATION_TYPE.S3, (cfg, buf, fn, opts) => deliverToS3(cfg as S3DestinationConfig, buf, fn, opts)],
    [DESTINATION_TYPE.SFTP, (cfg, buf, fn, opts) => deliverToSFTP(cfg as SFTPDestinationConfig, buf, fn, opts)],
    [DESTINATION_TYPE.FTP, (cfg, buf, fn, opts) => deliverToFTP(cfg as FTPDestinationConfig, buf, fn, opts)],
    [DESTINATION_TYPE.HTTP, (cfg, buf, fn, opts) => deliverToHTTP(cfg as HTTPDestinationConfig, buf, fn, opts)],
    [DESTINATION_TYPE.LOCAL, (cfg, buf, fn, opts) => deliverToLocal(cfg as LocalDestinationConfig, buf, fn, opts)],
    [DESTINATION_TYPE.EMAIL, (cfg, buf, fn, opts) => deliverToEmail(cfg as EmailDestinationConfig, buf, fn, opts)],
]);

/**
 * Maps each DESTINATION_TYPE to its corresponding test handler function.
 * Used by ExportDestinationService for connection testing.
 * Types without a test handler fall back to a generic "configured" response.
 */
export const DESTINATION_TEST_REGISTRY: ReadonlyMap<string, TestFn> = new Map<string, TestFn>([
    [DESTINATION_TYPE.S3, (_cfg, start) =>
        Promise.resolve({ success: true, message: 'S3 connection configured', latencyMs: Date.now() - start }),
    ],
    [DESTINATION_TYPE.HTTP, async (cfg, start) => {
        const httpConfig = cfg as HTTPDestinationConfig;
        await assertUrlSafe(httpConfig.url);
        const response = await fetch(httpConfig.url, { method: 'HEAD' }).catch(() => null);
        if (response) {
            return { success: true, message: `HTTP endpoint reachable (${response.status})`, latencyMs: Date.now() - start };
        }
        return { success: false, message: 'HTTP endpoint unreachable' };
    }],
    [DESTINATION_TYPE.LOCAL, (cfg, start) => {
        const result = testLocalDestination(cfg as LocalDestinationConfig);
        return Promise.resolve({ ...result, latencyMs: Date.now() - start });
    }],
]);

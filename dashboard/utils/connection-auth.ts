import { ConnectionAuthType } from '../../shared/types';

export const SUPPORTED_CONNECTION_AUTH_TYPES = new Set<ConnectionAuthType>([
    ConnectionAuthType.NONE,
    ConnectionAuthType.BASIC,
    ConnectionAuthType.BEARER,
    ConnectionAuthType.API_KEY,
]);

export function isSupportedConnectionAuthType(value: unknown): value is ConnectionAuthType {
    return typeof value === 'string' && SUPPORTED_CONNECTION_AUTH_TYPES.has(value as ConnectionAuthType);
}

export function filterSupportedConnectionAuthOptions<T extends { value: string }>(options: readonly T[]): T[] {
    return options.filter(option => isSupportedConnectionAuthType(option.value));
}

import type { JsonObject } from '../../types';

export const REMOTE_FILE_SOURCE_FIELD = '__dataHubRemoteFile' as const;

export interface RemoteFileSourceReference {
    connectionCode: string;
    path: string;
    name: string;
    modifiedAt: string;
    size: number;
}

export function createRemoteFileSourceRecord(
    reference: RemoteFileSourceReference,
): JsonObject {
    return {
        [REMOTE_FILE_SOURCE_FIELD]: { ...reference },
    };
}

export function readRemoteFileSourceReferences(
    records: readonly JsonObject[] | undefined,
    connectionCode?: string,
): RemoteFileSourceReference[] | undefined {
    if (records === undefined) return undefined;

    const references: RemoteFileSourceReference[] = [];
    for (const record of records) {
        const candidate = record[REMOTE_FILE_SOURCE_FIELD];
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
            continue;
        }

        const value = candidate as Record<string, unknown>;
        if (
            typeof value.connectionCode !== 'string' ||
            typeof value.path !== 'string' ||
            typeof value.name !== 'string' ||
            typeof value.modifiedAt !== 'string' ||
            typeof value.size !== 'number'
        ) {
            continue;
        }
        if (connectionCode !== undefined && value.connectionCode !== connectionCode) {
            continue;
        }

        references.push({
            connectionCode: value.connectionCode,
            path: value.path,
            name: value.name,
            modifiedAt: value.modifiedAt,
            size: value.size,
        });
    }
    return references;
}

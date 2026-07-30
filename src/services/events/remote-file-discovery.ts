import { FILE_WATCH } from '../../constants/defaults';
import type { FtpClient } from '../../extractors/ftp/connection';
import type { FtpFileInfo } from '../../extractors/ftp/types';
import type { S3Client } from '../../extractors/s3/client';
import type { S3ObjectInfo } from '../../extractors/s3/types';

interface PendingDirectory {
    path: string;
    depth: number;
}

export async function discoverFtpFiles(
    client: Pick<FtpClient, 'list'>,
    rootPath: string,
    recursive: boolean,
): Promise<FtpFileInfo[]> {
    const pending: PendingDirectory[] = [{ path: rootPath, depth: 0 }];
    const visited = new Set<string>();
    const files: FtpFileInfo[] = [];
    let examinedEntries = 0;

    for (let index = 0; index < pending.length; index += 1) {
        const directory = pending[index];
        if (visited.has(directory.path)) continue;
        visited.add(directory.path);

        const entries = await client.list(directory.path);
        examinedEntries += entries.length;
        if (examinedEntries > FILE_WATCH.MAX_REMOTE_ENTRIES_PER_POLL) {
            throw new Error(
                `Remote file discovery exceeded ${FILE_WATCH.MAX_REMOTE_ENTRIES_PER_POLL} entries`,
            );
        }

        for (const entry of entries) {
            if (!entry.isDirectory) {
                files.push(entry);
                continue;
            }
            if (!recursive) continue;
            if (directory.depth >= FILE_WATCH.MAX_REMOTE_DIRECTORY_DEPTH) {
                throw new Error(
                    `Remote file discovery exceeded directory depth ${FILE_WATCH.MAX_REMOTE_DIRECTORY_DEPTH}`,
                );
            }
            if (!visited.has(entry.path)) {
                pending.push({ path: entry.path, depth: directory.depth + 1 });
            }
        }
    }

    return files;
}

export function normalizeS3WatchPrefix(path: string): string {
    const prefix = path.replace(/^\/+/, '');
    return prefix.length === 0 || prefix.endsWith('/') ? prefix : `${prefix}/`;
}

export function shouldIncludeS3Object(
    key: string,
    prefix: string,
    recursive: boolean,
): boolean {
    if (key.endsWith('/') || !key.startsWith(prefix)) return false;
    const relativeKey = key.slice(prefix.length);
    return relativeKey.length > 0 && (recursive || !relativeKey.includes('/'));
}

export async function discoverS3Objects(
    client: Pick<S3Client, 'listObjects'>,
    prefix: string,
    recursive: boolean,
    isCancelled?: () => Promise<boolean>,
): Promise<S3ObjectInfo[]> {
    const objects: S3ObjectInfo[] = [];
    const seenTokens = new Set<string>();
    let continuationToken: string | undefined;
    let examinedEntries = 0;
    let pageCount = 0;

    do {
        if (await isCancelled?.()) {
            throw new Error('Remote file discovery was cancelled');
        }
        if (continuationToken !== undefined) {
            if (seenTokens.has(continuationToken)) {
                throw new Error('S3 listing returned a repeated continuation token');
            }
            seenTokens.add(continuationToken);
        }
        pageCount += 1;
        if (pageCount > FILE_WATCH.MAX_REMOTE_PAGES_PER_POLL) {
            throw new Error(
                `Remote file discovery exceeded ${FILE_WATCH.MAX_REMOTE_PAGES_PER_POLL} pages`,
            );
        }

        const result = await client.listObjects(prefix, continuationToken);
        examinedEntries += result.objects.length;
        if (examinedEntries > FILE_WATCH.MAX_REMOTE_ENTRIES_PER_POLL) {
            throw new Error(
                `Remote file discovery exceeded ${FILE_WATCH.MAX_REMOTE_ENTRIES_PER_POLL} entries`,
            );
        }
        objects.push(...result.objects.filter(object => (
            shouldIncludeS3Object(object.key, prefix, recursive)
        )));
        continuationToken = result.continuationToken;
    } while (continuationToken !== undefined);

    return objects;
}

import { FILE_WATCH } from '../../constants/defaults';
import type { FtpClient } from '../../extractors/ftp/connection';
import type { FtpFileInfo } from '../../extractors/ftp/types';

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

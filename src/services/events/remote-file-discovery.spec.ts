import { describe, expect, it, vi } from 'vitest';
import type { FtpFileInfo } from '../../extractors/ftp/types';
import { FILE_WATCH } from '../../constants/defaults';
import {
    discoverFtpFiles,
    discoverS3Objects,
    normalizeS3WatchPrefix,
    shouldIncludeS3Object,
} from './remote-file-discovery';

const file = (path: string, isDirectory = false): FtpFileInfo => ({
    name: path.split('/').pop() ?? path,
    path,
    size: isDirectory ? 0 : 10,
    modifiedAt: new Date('2026-07-16T10:00:00.000Z'),
    isDirectory,
});

const s3Object = (key: string) => ({
    key,
    size: 10,
    lastModified: new Date('2026-07-16T10:00:00.000Z'),
});

describe('remote file discovery', () => {
    it('traverses nested FTP directories only when recursion is enabled', async () => {
        const list = vi.fn(async (path: string) => {
            const entries: Record<string, FtpFileInfo[]> = {
                '/incoming': [file('/incoming/root.csv'), file('/incoming/archive', true)],
                '/incoming/archive': [file('/incoming/archive/nested.csv')],
            };
            return entries[path] ?? [];
        });

        await expect(discoverFtpFiles({ list }, '/incoming', false)).resolves.toEqual([
            file('/incoming/root.csv'),
        ]);
        await expect(discoverFtpFiles({ list }, '/incoming', true)).resolves.toEqual([
            file('/incoming/root.csv'),
            file('/incoming/archive/nested.csv'),
        ]);
    });

    it('normalizes S3 directory prefixes and honors non-recursive discovery', () => {
        const prefix = normalizeS3WatchPrefix('/incoming');
        expect(prefix).toBe('incoming/');
        expect(shouldIncludeS3Object('incoming/root.csv', prefix, false)).toBe(true);
        expect(shouldIncludeS3Object('incoming/archive/nested.csv', prefix, false)).toBe(false);
        expect(shouldIncludeS3Object('incoming/archive/nested.csv', prefix, true)).toBe(true);
        expect(shouldIncludeS3Object('incoming/archive/', prefix, true)).toBe(false);
        expect(shouldIncludeS3Object('incoming-old/file.csv', prefix, true)).toBe(false);
    });

    it('collects bounded S3 pages and applies recursion filtering', async () => {
        const listObjects = vi.fn()
            .mockResolvedValueOnce({
                objects: [s3Object('incoming/root.csv')],
                continuationToken: 'page-2',
                isTruncated: true,
            })
            .mockResolvedValueOnce({
                objects: [
                    s3Object('incoming/archive/nested.csv'),
                    s3Object('incoming/second.csv'),
                ],
                isTruncated: false,
            });

        await expect(discoverS3Objects(
            { listObjects },
            'incoming/',
            false,
        )).resolves.toEqual([
            s3Object('incoming/root.csv'),
            s3Object('incoming/second.csv'),
        ]);
        expect(listObjects).toHaveBeenNthCalledWith(1, 'incoming/', undefined);
        expect(listObjects).toHaveBeenNthCalledWith(2, 'incoming/', 'page-2');
    });

    it('rejects S3 listings that exceed the remote entry limit', async () => {
        const objects = Array.from(
            { length: FILE_WATCH.MAX_REMOTE_ENTRIES_PER_POLL + 1 },
            (_, index) => s3Object(`incoming/${index}.csv`),
        );

        await expect(discoverS3Objects(
            { listObjects: vi.fn(async () => ({ objects, isTruncated: false })) },
            'incoming/',
            true,
        )).rejects.toThrow(
            `Remote file discovery exceeded ${FILE_WATCH.MAX_REMOTE_ENTRIES_PER_POLL} entries`,
        );
    });

    it('rejects repeated S3 continuation tokens', async () => {
        const listObjects = vi.fn(async () => ({
            objects: [],
            continuationToken: 'cycle',
            isTruncated: true,
        }));

        await expect(discoverS3Objects(
            { listObjects },
            'incoming/',
            true,
        )).rejects.toThrow('S3 listing returned a repeated continuation token');
        expect(listObjects).toHaveBeenCalledTimes(2);
    });

    it('stops S3 discovery when pipeline execution is cancelled', async () => {
        const listObjects = vi.fn();

        await expect(discoverS3Objects(
            { listObjects },
            'incoming/',
            true,
            async () => true,
        )).rejects.toThrow('Remote file discovery was cancelled');
        expect(listObjects).not.toHaveBeenCalled();
    });
});

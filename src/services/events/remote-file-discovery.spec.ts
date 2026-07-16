import { describe, expect, it, vi } from 'vitest';
import type { FtpFileInfo } from '../../extractors/ftp/types';
import {
    discoverFtpFiles,
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
});

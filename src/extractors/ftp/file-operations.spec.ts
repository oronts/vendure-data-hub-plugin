import { describe, expect, it } from 'vitest';
import { filterFiles } from './file-operations';
import type { FtpFileInfo } from './types';

function file(path: string, modifiedAt: string): FtpFileInfo {
    return {
        path,
        name: path.split('/').pop() ?? path,
        size: 1,
        modifiedAt: new Date(modifiedAt),
        isDirectory: false,
    };
}

describe('filterFiles checkpoint ordering', () => {
    it('orders and resumes by the complete (mtime,path) tuple', () => {
        const timestamp = '2026-07-20T10:00:00.000Z';
        const files = [
            file('/incoming/c.csv', timestamp),
            file('/incoming/a.csv', timestamp),
            file('/incoming/b.csv', timestamp),
        ];

        expect(filterFiles(files, {
            protocol: 'sftp',
            host: 'files.example.com',
            remotePath: '/incoming',
        }, {
            lastProcessedFile: '/incoming/a.csv',
            lastModifiedAt: timestamp,
        }).map(item => item.path)).toEqual([
            '/incoming/b.csv',
            '/incoming/c.csv',
        ]);
    });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageBackend } from './local-storage.backend';

describe('LocalStorageBackend', () => {
    let root: string;
    let outside: string;
    let backend: LocalStorageBackend;

    beforeEach(async () => {
        root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'data-hub-storage-'));
        outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'data-hub-outside-'));
        backend = new LocalStorageBackend({ basePath: root });
        await backend.init();
    });

    afterEach(async () => {
        await fs.promises.rm(root, { recursive: true, force: true });
        await fs.promises.rm(outside, { recursive: true, force: true });
    });

    it('writes, reads, lists, and deletes regular files inside the storage root', async () => {
        await backend.write('channels/one/2026/07/products.csv', Buffer.from('sku\nA-1'));

        await expect(backend.read('channels/one/2026/07/products.csv'))
            .resolves.toEqual(Buffer.from('sku\nA-1'));
        await expect(backend.exists('channels/one/2026/07/products.csv')).resolves.toBe(true);
        await expect(backend.list('channels/one')).resolves.toEqual([
            'channels/one/2026/07/products.csv',
        ]);
        await expect(backend.delete('channels/one/2026/07/products.csv')).resolves.toBe(true);
        await expect(backend.read('channels/one/2026/07/products.csv')).resolves.toBeNull();
    });

    it.each([
        '../outside.csv',
        '/etc/passwd',
        'C:\\Windows\\system.ini',
        'channels//file.csv',
        'channels/./file.csv',
    ])('rejects unsafe storage key %s', async storageKey => {
        await expect(backend.write(storageKey, Buffer.from('unsafe'))).rejects.toThrow();
    });

    it('rejects a symbolic-link directory without writing outside the root', async () => {
        await fs.promises.symlink(outside, path.join(root, 'channels'));

        await expect(backend.write('channels/escaped.csv', Buffer.from('unsafe'))).rejects.toThrow();
        await expect(fs.promises.access(path.join(outside, 'escaped.csv'))).rejects.toThrow();
    });

    it('does not read, overwrite, or delete a symbolic-link target', async () => {
        const outsideFile = path.join(outside, 'secret.csv');
        await fs.promises.writeFile(outsideFile, 'outside');
        await fs.promises.symlink(outsideFile, path.join(root, 'linked.csv'));

        await expect(backend.read('linked.csv')).rejects.toThrow();
        await expect(backend.write('linked.csv', Buffer.from('changed'))).rejects.toThrow();
        await expect(backend.delete('linked.csv')).rejects.toThrow();
        await expect(fs.promises.readFile(outsideFile, 'utf-8')).resolves.toBe('outside');
    });

    it('ignores symbolic links while walking the storage root', async () => {
        await backend.write('safe.csv', Buffer.from('safe'));
        await fs.promises.symlink(path.join(outside, 'missing.csv'), path.join(root, 'linked.csv'));

        await expect(backend.list('')).resolves.toEqual(['safe.csv']);
    });

    it('supports concurrent writes that create the same directory tree', async () => {
        await Promise.all(Array.from({ length: 20 }, (_, index) =>
            backend.write('channels/shared/2026/07/file-' + index + '.csv', Buffer.from(String(index))),
        ));

        await expect(backend.list('channels/shared/2026/07')).resolves.toHaveLength(20);
    });

    it('rejects a symbolic-link storage root', async () => {
        const linkedRoot = path.join(outside, 'linked-root');
        await fs.promises.symlink(root, linkedRoot);

        await expect(new LocalStorageBackend({ basePath: linkedRoot }).init()).rejects.toThrow(
            'Local storage root must be a real directory',
        );
    });
});

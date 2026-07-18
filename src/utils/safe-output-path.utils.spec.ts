import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSafeOutputPath, writeFileSafely } from './safe-output-path.utils';

describe('safe output paths', () => {
    let testRoot: string;

    beforeEach(async () => {
        testRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'data-hub-output-'));
    });

    afterEach(async () => {
        await fs.promises.rm(testRoot, { recursive: true, force: true });
    });

    it('resolves nested relative files within the export root', async () => {
        const target = await resolveSafeOutputPath(testRoot, 'catalog/daily', 'products.csv');

        expect(target).toBe(path.join(testRoot, 'catalog', 'daily', 'products.csv'));
        await writeFileSafely(target, 'sku\nSKU-1');
        await expect(fs.promises.readFile(target, 'utf-8')).resolves.toBe('sku\nSKU-1');
    });

    it('rejects absolute and traversal paths', async () => {
        await expect(resolveSafeOutputPath(testRoot, '/etc', 'passwd')).rejects.toThrow('must be relative');
        await expect(resolveSafeOutputPath(testRoot, 'catalog', '../outside.csv')).rejects.toThrow('directory traversal');
        await expect(resolveSafeOutputPath(testRoot, '..\\outside', 'file.csv')).rejects.toThrow('directory traversal');
    });

    it('rejects symbolic links in output directories', async () => {
        const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'data-hub-outside-'));
        try {
            await fs.promises.symlink(outside, path.join(testRoot, 'linked'));
            await expect(resolveSafeOutputPath(testRoot, 'linked', 'file.csv')).rejects.toThrow('symbolic links');
        } finally {
            await fs.promises.rm(outside, { recursive: true, force: true });
        }
    });

    it('refuses to overwrite a symbolic-link target', async () => {
        const outsideFile = path.join(os.tmpdir(), `data-hub-outside-${Date.now()}.txt`);
        await fs.promises.writeFile(outsideFile, 'outside');
        try {
            const target = path.join(testRoot, 'linked-file.txt');
            await fs.promises.symlink(outsideFile, target);
            await expect(resolveSafeOutputPath(testRoot, '.', 'linked-file.txt')).rejects.toThrow('symbolic link');
            await expect(fs.promises.readFile(outsideFile, 'utf-8')).resolves.toBe('outside');
        } finally {
            await fs.promises.rm(outsideFile, { force: true });
        }
    });
});

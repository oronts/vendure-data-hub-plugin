/**
 * Local Filesystem Storage Backend
 */

import * as fs from 'fs';
import * as path from 'path';
import { StorageBackend, LocalStorageOptions } from './storage-backend.interface';
import { securePath } from '../../utils/input-validation.utils';

export class LocalStorageBackend implements StorageBackend {
    readonly type = 'local' as const;
    private basePath: string;

    constructor(private options: LocalStorageOptions) {
        this.basePath = path.resolve(options.basePath);
    }

    /**
     * Securely resolve a path within the storage base directory.
     * Prevents path traversal attacks by ensuring the resolved path
     * stays within the basePath boundary.
     */
    private getSecurePath(filePath: string): string {
        return securePath(this.basePath, filePath);
    }

    async init(): Promise<void> {
        try {
            await fs.promises.access(this.basePath);
        } catch {
            await fs.promises.mkdir(this.basePath, { recursive: true });
        }
    }

    async write(filePath: string, data: Buffer): Promise<void> {
        const fullPath = this.getSecurePath(filePath);
        const dir = path.dirname(fullPath);

        try {
            await fs.promises.access(dir);
        } catch {
            await fs.promises.mkdir(dir, { recursive: true });
        }

        await fs.promises.writeFile(fullPath, data);
    }

    async read(filePath: string): Promise<Buffer | null> {
        const fullPath = this.getSecurePath(filePath);

        try {
            return await fs.promises.readFile(fullPath);
        } catch {
            return null;
        }
    }

    async delete(filePath: string): Promise<boolean> {
        const fullPath = this.getSecurePath(filePath);

        try {
            await fs.promises.unlink(fullPath);
            return true;
        } catch {
            return false;
        }
    }

    async exists(filePath: string): Promise<boolean> {
        const fullPath = this.getSecurePath(filePath);
        try {
            await fs.promises.access(fullPath);
            return true;
        } catch {
            return false;
        }
    }

    async list(prefix: string): Promise<string[]> {
        const fullPath = this.getSecurePath(prefix);

        try {
            await fs.promises.access(fullPath);
        } catch {
            return [];
        }

        try {
            const stat = await fs.promises.stat(fullPath);
            if (!stat.isDirectory()) {
                return [prefix];
            }

            const files: string[] = [];
            await this.walkDir(fullPath, prefix, files);
            return files;
        } catch {
            return [];
        }
    }

    private async walkDir(dir: string, prefix: string, files: string[]): Promise<void> {
        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const relativePath = path.join(prefix, entry.name);

                if (entry.isDirectory()) {
                    await this.walkDir(path.join(dir, entry.name), relativePath, files);
                } else {
                    files.push(relativePath);
                }
            }
        } catch {
            // Errors during directory walk are expected when files/directories are
            // deleted or permissions change during traversal - skip and continue
        }
    }
}

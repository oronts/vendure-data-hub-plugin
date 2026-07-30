import * as fs from 'fs';
import * as path from 'path';
import { StorageBackend, LocalStorageOptions } from './storage-backend.interface';

const NO_FOLLOW = fs.constants.O_NOFOLLOW ?? 0;

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isAlreadyExistsError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

export class LocalStorageBackend implements StorageBackend {
    readonly type = 'local' as const;
    private readonly configuredBasePath: string;
    private basePath: string | null = null;

    constructor(options: LocalStorageOptions) {
        this.configuredBasePath = path.resolve(options.basePath);
    }

    async init(): Promise<void> {
        await fs.promises.mkdir(this.configuredBasePath, { recursive: true, mode: 0o700 });
        const rootStat = await fs.promises.lstat(this.configuredBasePath);
        if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
            throw new Error('Local storage root must be a real directory');
        }
        this.basePath = await fs.promises.realpath(this.configuredBasePath);
    }

    async write(filePath: string, data: Buffer): Promise<void> {
        const fullPath = this.resolveStoragePath(filePath);
        await this.ensureSafeParentDirectories(fullPath);
        await this.assertWritableTarget(fullPath);

        const handle = await fs.promises.open(
            fullPath,
            fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC |
                fs.constants.O_NONBLOCK | NO_FOLLOW,
            0o600,
        );
        try {
            const stat = await handle.stat();
            if (!stat.isFile()) {
                throw new Error('Storage target must be a regular file');
            }
            await handle.writeFile(data);
        } finally {
            await handle.close();
        }
    }

    async read(filePath: string): Promise<Buffer | null> {
        const fullPath = this.resolveStoragePath(filePath);

        try {
            await this.assertSafeParentDirectories(fullPath);
            await this.assertRegularFile(fullPath);
            const handle = await fs.promises.open(
                fullPath,
                fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | NO_FOLLOW,
            );
            try {
                const stat = await handle.stat();
                if (!stat.isFile()) {
                    throw new Error('Storage target must be a regular file');
                }
                return await handle.readFile();
            } finally {
                await handle.close();
            }
        } catch (error) {
            if (isMissingFileError(error)) return null;
            throw error;
        }
    }

    async delete(filePath: string): Promise<boolean> {
        const fullPath = this.resolveStoragePath(filePath);

        try {
            await this.assertSafeParentDirectories(fullPath);
            await this.assertRegularFile(fullPath);
            await fs.promises.unlink(fullPath);
            return true;
        } catch (error) {
            if (isMissingFileError(error)) return false;
            throw error;
        }
    }

    async exists(filePath: string): Promise<boolean> {
        const fullPath = this.resolveStoragePath(filePath);
        try {
            await this.assertSafeParentDirectories(fullPath);
            await this.assertRegularFile(fullPath);
            return true;
        } catch (error) {
            if (isMissingFileError(error)) return false;
            throw error;
        }
    }

    async list(prefix: string): Promise<string[]> {
        const fullPath = prefix ? this.resolveStoragePath(prefix) : this.getInitializedBasePath();
        const normalizedPrefix = this.normalizeStorageKey(prefix, true);

        try {
            if (fullPath !== this.getInitializedBasePath()) {
                await this.assertSafeParentDirectories(fullPath);
            }
            const stat = await fs.promises.lstat(fullPath);
            if (stat.isSymbolicLink()) {
                throw new Error('Symbolic links are not allowed in local storage');
            }
            if (!stat.isDirectory()) {
                if (!stat.isFile()) throw new Error('Storage target must be a regular file');
                return [normalizedPrefix];
            }

            const files: string[] = [];
            await this.walkDir(fullPath, normalizedPrefix, files);
            return files;
        } catch (error) {
            if (isMissingFileError(error)) return [];
            throw error;
        }
    }

    private async walkDir(dir: string, prefix: string, files: string[]): Promise<void> {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            let stat: fs.Stats;
            try {
                stat = await fs.promises.lstat(entryPath);
            } catch (error) {
                if (isMissingFileError(error)) continue;
                throw error;
            }
            if (stat.isSymbolicLink()) continue;

            const storagePath = prefix ? path.posix.join(prefix, entry.name) : entry.name;
            if (stat.isDirectory()) {
                await this.walkDir(entryPath, storagePath, files);
            } else if (stat.isFile()) {
                files.push(storagePath);
            }
        }
    }

    private resolveStoragePath(filePath: string): string {
        const storageKey = this.normalizeStorageKey(filePath, false);
        const root = this.getInitializedBasePath();
        const fullPath = path.resolve(root, ...storageKey.split('/'));
        const relative = path.relative(root, fullPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('Storage path escapes the configured root');
        }
        return fullPath;
    }

    private normalizeStorageKey(filePath: string, allowEmpty: boolean): string {
        if (filePath.includes('\0')) throw new Error('Storage path contains a null byte');
        if (path.posix.isAbsolute(filePath) || path.win32.isAbsolute(filePath)) {
            throw new Error('Storage path must be relative');
        }

        const segments = filePath.replace(/\\/g, '/').split('/');
        if (allowEmpty && segments.length === 1 && segments[0] === '') return '';
        if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
            throw new Error('Storage path contains an invalid segment');
        }
        return segments.join('/');
    }

    private async ensureSafeParentDirectories(fullPath: string): Promise<void> {
        const root = this.getInitializedBasePath();
        const relativeParent = path.relative(root, path.dirname(fullPath));
        let current = root;
        for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
            current = path.join(current, segment);
            try {
                const stat = await fs.promises.lstat(current);
                this.assertDirectory(stat);
            } catch (error) {
                if (!isMissingFileError(error)) throw error;
                try {
                    await fs.promises.mkdir(current, { mode: 0o700 });
                } catch (mkdirError) {
                    if (!isAlreadyExistsError(mkdirError)) throw mkdirError;
                }
                this.assertDirectory(await fs.promises.lstat(current));
            }
            await this.assertRealPathWithinRoot(current);
        }
    }

    private async assertSafeParentDirectories(fullPath: string): Promise<void> {
        const root = this.getInitializedBasePath();
        const relativeParent = path.relative(root, path.dirname(fullPath));
        let current = root;
        for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
            current = path.join(current, segment);
            this.assertDirectory(await fs.promises.lstat(current));
            await this.assertRealPathWithinRoot(current);
        }
    }

    private assertDirectory(stat: fs.Stats): void {
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw new Error('Storage path contains a non-directory or symbolic link');
        }
    }

    private async assertWritableTarget(fullPath: string): Promise<void> {
        try {
            await this.assertRegularFile(fullPath);
        } catch (error) {
            if (isMissingFileError(error)) return;
            throw error;
        }
    }

    private async assertRegularFile(fullPath: string): Promise<void> {
        const stat = await fs.promises.lstat(fullPath);
        if (stat.isSymbolicLink() || !stat.isFile()) {
            throw new Error('Storage target must be a regular file and cannot be a symbolic link');
        }
    }

    private async assertRealPathWithinRoot(candidate: string): Promise<void> {
        const root = this.getInitializedBasePath();
        const realPath = await fs.promises.realpath(candidate);
        const relative = path.relative(root, realPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('Storage path escapes the configured root');
        }
    }

    private getInitializedBasePath(): string {
        if (!this.basePath) throw new Error('Local storage backend has not been initialized');
        return this.basePath;
    }
}

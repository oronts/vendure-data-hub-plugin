import * as fs from 'fs';
import * as path from 'path';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

function isMissingPath(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function assertRelativePath(value: string, label: string): void {
    if (value.includes('\0')) {
        throw new Error(`${label} contains a null byte`);
    }
    if (path.isAbsolute(value) || path.win32.isAbsolute(value)) {
        throw new Error(`${label} must be relative to the configured export root`);
    }
    const segments = value.replace(/\\/g, '/').split('/');
    if (segments.includes('..')) {
        throw new Error(`${label} contains directory traversal`);
    }
}

function assertWithinRoot(root: string, candidate: string): void {
    const relative = path.relative(root, candidate);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('Output path escapes the configured export root');
    }
}

async function readPathState(targetPath: string): Promise<fs.Stats | undefined> {
    try {
        return await fs.promises.lstat(targetPath);
    } catch (error) {
        if (isMissingPath(error)) {
            return undefined;
        }
        throw error;
    }
}

async function ensureSafeDirectoryTree(root: string, targetDirectory: string): Promise<void> {
    assertWithinRoot(root, targetDirectory);
    const relative = path.relative(root, targetDirectory);
    let current = root;

    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        let state = await readPathState(current);
        if (!state) {
            try {
                await fs.promises.mkdir(current, { mode: DIRECTORY_MODE });
            } catch (error) {
                if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) {
                    throw error;
                }
            }
            state = await fs.promises.lstat(current);
        }
        if (state.isSymbolicLink()) {
            throw new Error('Output directory cannot contain symbolic links');
        }
        if (!state.isDirectory()) {
            throw new Error('Output directory path contains a non-directory entry');
        }
        const realCurrent = await fs.promises.realpath(current);
        assertWithinRoot(root, realCurrent);
    }
}

export async function resolveSafeOutputPath(
    exportRoot: string,
    relativeDirectory: string,
    relativeFilename: string,
): Promise<string> {
    const directory = relativeDirectory.trim() || '.';
    const filename = relativeFilename.trim();
    if (!filename || filename === '.') {
        throw new Error('Output filename is required');
    }
    assertRelativePath(directory, 'Output directory');
    assertRelativePath(filename, 'Output filename');

    const configuredRoot = path.resolve(exportRoot);
    await fs.promises.mkdir(configuredRoot, { recursive: true, mode: DIRECTORY_MODE });
    const realRoot = await fs.promises.realpath(configuredRoot);
    const targetPath = path.resolve(realRoot, directory, filename);
    assertWithinRoot(realRoot, targetPath);
    await ensureSafeDirectoryTree(realRoot, path.dirname(targetPath));

    const state = await readPathState(targetPath);
    if (state?.isSymbolicLink()) {
        throw new Error('Output file cannot be a symbolic link');
    }
    if (state && !state.isFile()) {
        throw new Error('Output path is not a regular file');
    }
    return targetPath;
}

export async function writeFileSafely(filePath: string, content: string | Buffer): Promise<void> {
    const flags = fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_TRUNC |
        fs.constants.O_NOFOLLOW;
    const file = await fs.promises.open(filePath, flags, FILE_MODE);
    try {
        await file.writeFile(content, typeof content === 'string' ? { encoding: 'utf-8' } : undefined);
    } finally {
        await file.close();
    }
}

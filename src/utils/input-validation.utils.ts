import * as path from 'path';

export { isValidEmail, isValidPipelineCode } from '../../shared';

export function isValidPath(filePath: string): boolean {
    if (filePath.includes('\0')) {
        return false;
    }

    const normalized = path.normalize(filePath);

    if (normalized.startsWith('..') || normalized.startsWith('/..') || normalized.includes('/../')) {
        return false;
    }

    if (path.isAbsolute(normalized) && !path.isAbsolute(filePath)) {
        return false;
    }

    return true;
}

/** Throws if path contains traversal attempts or escapes base directory. */
export function securePath(basePath: string, relativePath: string): string {
    // Check for null bytes
    if (relativePath.includes('\0') || basePath.includes('\0')) {
        throw new Error('Path contains null bytes');
    }

    // Check for obvious traversal patterns before resolution
    if (relativePath.includes('..')) {
        throw new Error('Path contains directory traversal sequences');
    }

    // Resolve the base path to absolute
    const resolvedBase = path.resolve(basePath);

    // Join and resolve the full path
    const fullPath = path.resolve(resolvedBase, relativePath);

    // Verify the resolved path is within the base directory
    // Use path.sep to ensure we check the full directory boundary
    const normalizedBase = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;

    if (!fullPath.startsWith(normalizedBase) && fullPath !== resolvedBase) {
        throw new Error('Path escapes base directory');
    }

    return fullPath;
}


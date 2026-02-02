import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { FileInfo, FileExtractorConfig } from './types';
import { isValidPath, securePath } from '../../utils/input-validation.utils';
import { SortOrder } from '../../constants/enums';

export function resolvePath(filePath: string, baseDir?: string): string {
    // Validate the path doesn't contain traversal sequences
    if (!isValidPath(filePath)) {
        throw new Error('Invalid file path: path contains traversal sequences or invalid characters');
    }

    if (path.isAbsolute(filePath)) {
        return filePath;
    }

    const base = baseDir || process.cwd();

    // Use securePath to ensure the resolved path stays within the base directory
    return securePath(base, filePath);
}

export async function getFiles(config: FileExtractorConfig): Promise<FileInfo[]> {
    const fullPath = resolvePath(config.path, config.baseDir);
    const isGlob = fullPath.includes('*') || fullPath.includes('?');

    let filePaths: string[];

    if (isGlob) {
        filePaths = await glob(fullPath, { nodir: true });
    } else {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
            // Read all files in directory
            const entries = await fs.readdir(fullPath, { withFileTypes: true });
            filePaths = entries
                .filter(e => e.isFile())
                .map(e => path.join(fullPath, e.name));
        } else {
            filePaths = [fullPath];
        }
    }

    const files: FileInfo[] = await Promise.all(
        filePaths.map(async filePath => {
            const stat = await fs.stat(filePath);
            return {
                path: filePath,
                name: path.basename(filePath),
                size: stat.size,
                modifiedAt: stat.mtime,
            };
        }),
    );

    const sortBy = config.sortBy || 'modified';
    const sortOrder = config.sortOrder || SortOrder.ASC;
    const multiplier = sortOrder === SortOrder.DESC ? -1 : 1;

    files.sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return multiplier * a.name.localeCompare(b.name);
            case 'size':
                return multiplier * (a.size - b.size);
            case 'modified':
            default:
                return multiplier * (a.modifiedAt.getTime() - b.modifiedAt.getTime());
        }
    });

    return files;
}

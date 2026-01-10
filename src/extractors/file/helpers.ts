import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { FileInfo, FileExtractorConfig } from './types';

export function resolvePath(filePath: string, baseDir?: string): string {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }
    return path.join(baseDir || process.cwd(), filePath);
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
    const sortOrder = config.sortOrder || 'asc';
    const multiplier = sortOrder === 'desc' ? -1 : 1;

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

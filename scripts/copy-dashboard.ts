import { cp, mkdir, rm } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';

const sourceDirectory = resolve(__dirname, '../dashboard');
const targetDirectory = resolve(__dirname, '../dist/dashboard');
const testFilePattern = /\.(?:spec|test)\.[cm]?[jt]sx?$/;
const excludedDirectories = new Set(['__tests__']);

function shouldCopy(sourcePath: string): boolean {
    const relativePath = relative(sourceDirectory, sourcePath);
    const pathSegments = relativePath.split(sep);

    return !pathSegments.some(segment => excludedDirectories.has(segment))
        && !testFilePattern.test(basename(sourcePath));
}

async function copyDashboardSources(): Promise<void> {
    await rm(targetDirectory, { recursive: true, force: true });
    await mkdir(targetDirectory, { recursive: true });
    await cp(sourceDirectory, targetDirectory, {
        recursive: true,
        filter: shouldCopy,
    });
}

void copyDashboardSources();

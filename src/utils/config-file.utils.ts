import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { DataHubPluginOptions } from '../types';
import { getErrorMessage } from './error.utils';

function isConfigurationObject(value: unknown): value is Partial<DataHubPluginOptions> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadDataHubConfigFile(
    configPath: string,
): Partial<DataHubPluginOptions> {
    const absolutePath = path.isAbsolute(configPath)
        ? configPath
        : path.resolve(process.cwd(), configPath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`DataHub config file not found: ${absolutePath}`);
    }

    let content: string;
    try {
        content = fs.readFileSync(absolutePath, 'utf-8');
    } catch (error) {
        throw new Error(
            `Could not read DataHub config file ${absolutePath}: ${getErrorMessage(error)}`,
        );
    }

    const extension = path.extname(absolutePath).toLowerCase();
    let parsed: unknown;
    try {
        switch (extension) {
            case '.json':
                parsed = JSON.parse(content) as unknown;
                break;
            case '.yaml':
            case '.yml':
                parsed = yaml.load(content);
                break;
            default:
                throw new Error(
                    `Unsupported DataHub config file extension "${extension}"; expected .json, .yaml, or .yml`,
                );
        }
    } catch (error) {
        throw new Error(
            `Could not parse DataHub config file ${absolutePath}: ${getErrorMessage(error)}`,
        );
    }

    if (!isConfigurationObject(parsed)) {
        throw new Error(
            `DataHub config file ${absolutePath} must contain an object at its root`,
        );
    }

    return parsed;
}

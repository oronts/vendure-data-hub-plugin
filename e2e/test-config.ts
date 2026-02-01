import 'reflect-metadata';
import { createTestEnvironment, registerInitializer, SqljsInitializer, testConfig as defaultTestConfig } from '@vendure/testing';
import { mergeConfig } from '@vendure/core';
import path from 'path';
import fs from 'fs';
import { DataHubPlugin } from '../src/data-hub.plugin';

const dataPath = path.join(__dirname, '__data__');

// Ensure data directory exists
if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
}

// Clear any existing database files to ensure fresh state on module load
// This runs once when the module is first imported in each fork
if (fs.existsSync(dataPath)) {
    const files = fs.readdirSync(dataPath);
    for (const file of files) {
        if (file.endsWith('.sqlite')) {
            try {
                fs.unlinkSync(path.join(dataPath, file));
            } catch {
                // Ignore errors when deleting files
            }
        }
    }
}

// Register the initializer at module load time (once per process/fork)
registerInitializer('sqljs', new SqljsInitializer(dataPath));

export const testConfig = mergeConfig(defaultTestConfig, {
    plugins: [
        DataHubPlugin.init({
            enabled: true,
        }),
    ],
    // Use dropSchema to ensure fresh database each time
    dbConnectionOptions: {
        ...defaultTestConfig.dbConnectionOptions,
        synchronize: true,
    },
});

/**
 * Creates a test environment for DataHub e2e tests.
 * Each call creates a fresh environment suitable for independent test execution.
 */
export function createDataHubTestEnvironment() {
    return createTestEnvironment(testConfig);
}

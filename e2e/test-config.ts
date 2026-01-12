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

// Track if initializer has been registered
let initializerRegistered = false;

export const testConfig = mergeConfig(defaultTestConfig, {
    plugins: [
        DataHubPlugin.init({
            enabled: true,
        }),
    ],
});

/**
 * Creates a test environment for DataHub e2e tests.
 * Each call creates a fresh environment suitable for independent test execution.
 */
export function createDataHubTestEnvironment() {
    // Register the initializer only once per process
    if (!initializerRegistered) {
        // Clear any existing database files to ensure fresh state
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
        registerInitializer('sqljs', new SqljsInitializer(dataPath));
        initializerRegistered = true;
    }

    return createTestEnvironment(testConfig);
}

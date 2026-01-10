import 'reflect-metadata';
import { createTestEnvironment, registerInitializer, SqljsInitializer, testConfig as defaultTestConfig } from '@vendure/testing';
import { mergeConfig } from '@vendure/core';
import path from 'path';
import { DataHubPlugin } from '../src/data-hub.plugin';

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')));

export const testConfig = mergeConfig(defaultTestConfig, {
    plugins: [
        DataHubPlugin.init({
            enabled: true,
        }),
    ],
});

export function createDataHubTestEnvironment() {
    return createTestEnvironment(testConfig);
}

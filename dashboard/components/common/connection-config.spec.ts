import { describe, expect, it } from 'vitest';
import { ConnectionAuthType } from '../../../shared/types';
import { CONNECTION_TYPE, HTTP_CONNECTION_DEFAULTS } from '../../constants';
import {
    createDefaultConnectionConfig,
    normalizeConnectionConfig,
    normalizeHttpConfig,
    resolveConnectionSchema,
    serializeConnectionConfig,
} from './connection-config';

describe('connection config helpers', () => {
    it('creates a complete default HTTP configuration', () => {
        expect(createDefaultConnectionConfig(CONNECTION_TYPE.HTTP)).toEqual({
            baseUrl: '',
            timeout: HTTP_CONNECTION_DEFAULTS.TIMEOUT_MS,
            headers: {},
            auth: { type: ConnectionAuthType.NONE },
        });
    });

    it('normalizes persisted HTTP values without retaining invalid fields', () => {
        expect(normalizeHttpConfig({
            baseUrl: 'https://api.example.com',
            timeout: 5_000,
            headers: { Accept: 'application/json', Invalid: 42 },
            auth: {
                type: ConnectionAuthType.API_KEY,
                headerName: 'X-Api-Key',
                secretCode: 'api-key',
                invalid: 'ignored',
            },
        })).toEqual({
            baseUrl: 'https://api.example.com',
            timeout: 5_000,
            headers: { Accept: 'application/json' },
            auth: {
                type: ConnectionAuthType.API_KEY,
                headerName: 'X-Api-Key',
                secretCode: 'api-key',
            },
        });
    });

    it('parses JSON and falls back safely for malformed values', () => {
        expect(normalizeConnectionConfig(
            CONNECTION_TYPE.HTTP,
            '{"baseUrl":"https://api.example.com"}',
        )).toMatchObject({
            baseUrl: 'https://api.example.com',
            auth: { type: ConnectionAuthType.NONE },
        });
        expect(normalizeConnectionConfig(CONNECTION_TYPE.HTTP, '{')).toEqual(
            createDefaultConnectionConfig(CONNECTION_TYPE.HTTP),
        );
    });

    it('maps backend schema field types without inventing fields', () => {
        expect(resolveConnectionSchema('POSTGRES', [{
            type: 'POSTGRES',
            label: 'PostgreSQL',
            fields: [
                {
                    key: 'host',
                    label: 'Host',
                    type: 'text',
                    required: true,
                    placeholder: null,
                    description: null,
                    options: null,
                    defaultValue: null,
                },
                {
                    key: 'port',
                    label: 'Port',
                    type: 'number',
                    required: false,
                    placeholder: '5432',
                    description: 'Database port',
                    options: null,
                    defaultValue: null,
                },
            ],
        }])).toEqual([
            {
                key: 'host',
                label: 'Host',
                type: 'string',
                required: true,
                placeholder: undefined,
                description: undefined,
                defaultValue: undefined,
                min: undefined,
                max: undefined,
                options: undefined,
            },
            {
                key: 'port',
                label: 'Port',
                type: 'number',
                required: false,
                placeholder: '5432',
                description: 'Database port',
                defaultValue: undefined,
                min: undefined,
                max: undefined,
                options: undefined,
            },
        ]);
    });

    it('preserves JSON, select, default, and range metadata', () => {
        expect(resolveConnectionSchema('CUSTOM', [{
            type: 'CUSTOM',
            label: 'Custom',
            fields: [
                {
                    key: 'config',
                    label: 'Configuration',
                    type: 'json',
                    defaultValue: { retries: 2 },
                    min: null,
                    max: null,
                    options: null,
                },
                {
                    key: 'mode',
                    label: 'Mode',
                    type: 'select',
                    defaultValue: 'safe',
                    min: null,
                    max: null,
                    options: [
                        { value: 'safe', label: 'Safe' },
                        { value: 'fast', label: 'Fast' },
                    ],
                },
            ],
        }])).toMatchObject([
            {
                key: 'config',
                type: 'json',
                defaultValue: { retries: 2 },
            },
            {
                key: 'mode',
                type: 'select',
                defaultValue: 'safe',
                options: [
                    { value: 'safe', label: 'Safe' },
                    { value: 'fast', label: 'Fast' },
                ],
            },
        ]);
    });

    it('omits empty HTTP values and parses JSON drafts for persistence', () => {
        expect(serializeConnectionConfig(CONNECTION_TYPE.HTTP, {
            baseUrl: '   ',
            timeout: HTTP_CONNECTION_DEFAULTS.TIMEOUT_MS,
            headers: {},
            auth: { type: ConnectionAuthType.NONE },
        })).toEqual({ timeout: HTTP_CONNECTION_DEFAULTS.TIMEOUT_MS });

        const customSchemas = [{
            type: CONNECTION_TYPE.CUSTOM,
            label: 'Custom',
            fields: [{ key: 'config', label: 'Configuration', type: 'json' }],
        }];
        expect(serializeConnectionConfig(CONNECTION_TYPE.CUSTOM, {
            config: '{"endpoint":"https://example.com","retries":2}',
        }, customSchemas)).toEqual({
            config: { endpoint: 'https://example.com', retries: 2 },
        });
    });
});

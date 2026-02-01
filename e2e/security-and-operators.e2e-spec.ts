import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDataHubTestEnvironment } from './test-config';
import gql from 'graphql-tag';

// Direct imports for security utility tests
import {
    validateUrlSafetySync,
    isPrivateIP,
    isBlockedHostname,
} from '../src/utils/url-security.utils';
import {
    validateColumnName,
    validateTableName,
    containsSqlInjection,
    escapeSqlIdentifier,
} from '../src/utils/sql-security.utils';

describe('Security Utilities', () => {
    describe('SSRF Protection (url-security.utils)', () => {
        describe('isPrivateIP', () => {
            it('blocks loopback addresses', () => {
                expect(isPrivateIP('127.0.0.1')).toBe(true);
                expect(isPrivateIP('127.0.0.2')).toBe(true);
                expect(isPrivateIP('127.255.255.255')).toBe(true);
            });

            it('blocks private Class A (10.x.x.x)', () => {
                expect(isPrivateIP('10.0.0.1')).toBe(true);
                expect(isPrivateIP('10.255.255.255')).toBe(true);
            });

            it('blocks private Class B (172.16-31.x.x)', () => {
                expect(isPrivateIP('172.16.0.1')).toBe(true);
                expect(isPrivateIP('172.31.255.255')).toBe(true);
                expect(isPrivateIP('172.15.0.1')).toBe(false); // Outside range
                expect(isPrivateIP('172.32.0.1')).toBe(false); // Outside range
            });

            it('blocks private Class C (192.168.x.x)', () => {
                expect(isPrivateIP('192.168.0.1')).toBe(true);
                expect(isPrivateIP('192.168.255.255')).toBe(true);
            });

            it('blocks link-local / cloud metadata (169.254.x.x)', () => {
                expect(isPrivateIP('169.254.169.254')).toBe(true); // AWS/GCP metadata
                expect(isPrivateIP('169.254.0.1')).toBe(true);
            });

            it('allows public IPs', () => {
                expect(isPrivateIP('8.8.8.8')).toBe(false);
                expect(isPrivateIP('1.1.1.1')).toBe(false);
                expect(isPrivateIP('203.0.114.1')).toBe(false);
            });

            it('blocks IPv6 loopback', () => {
                expect(isPrivateIP('::1')).toBe(true);
            });

            it('blocks IPv6 private (ULA)', () => {
                expect(isPrivateIP('fc00::1')).toBe(true);
                expect(isPrivateIP('fd00::1')).toBe(true);
            });
        });

        describe('isBlockedHostname', () => {
            it('blocks localhost variants', () => {
                expect(isBlockedHostname('localhost')).toBe(true);
                expect(isBlockedHostname('LOCALHOST')).toBe(true);
                expect(isBlockedHostname('localhost.localdomain')).toBe(true);
            });

            it('blocks cloud metadata hostnames', () => {
                expect(isBlockedHostname('metadata.google.internal')).toBe(true);
                expect(isBlockedHostname('metadata.goog')).toBe(true);
                expect(isBlockedHostname('169.254.169.254')).toBe(true);
                expect(isBlockedHostname('instance-data')).toBe(true);
                expect(isBlockedHostname('metadata.azure.com')).toBe(true);
            });

            it('allows normal hostnames', () => {
                expect(isBlockedHostname('api.example.com')).toBe(false);
                expect(isBlockedHostname('google.com')).toBe(false);
            });

            it('blocks additional custom hostnames', () => {
                expect(isBlockedHostname('internal.corp', ['internal.corp'])).toBe(true);
            });
        });

        describe('validateUrlSafetySync', () => {
            it('allows valid public URLs', () => {
                const result = validateUrlSafetySync('https://api.example.com/data');
                expect(result.safe).toBe(true);
            });

            it('blocks non-http(s) schemes', () => {
                const result = validateUrlSafetySync('file:///etc/passwd');
                expect(result.safe).toBe(false);
                expect(result.reason).toContain('scheme');
            });

            it('blocks localhost URLs', () => {
                const result = validateUrlSafetySync('http://localhost:8080/api');
                expect(result.safe).toBe(false);
            });

            it('blocks private IP URLs', () => {
                const result = validateUrlSafetySync('http://192.168.1.1/admin');
                expect(result.safe).toBe(false);
                expect(result.reason).toContain('blocked');
            });

            it('blocks cloud metadata URLs', () => {
                const result = validateUrlSafetySync('http://169.254.169.254/latest/meta-data/');
                expect(result.safe).toBe(false);
            });

            it('blocks invalid URLs', () => {
                const result = validateUrlSafetySync('not-a-url');
                expect(result.safe).toBe(false);
                expect(result.reason).toContain('Invalid URL');
            });

            it('respects allowedHostnames config', () => {
                const result = validateUrlSafetySync('http://localhost:3000/api', {
                    allowedHostnames: ['localhost'],
                });
                expect(result.safe).toBe(true);
            });

            it('can be disabled via config', () => {
                const result = validateUrlSafetySync('http://192.168.1.1/admin', {
                    disableSsrfProtection: true,
                });
                expect(result.safe).toBe(true);
            });
        });
    });

    describe('SQL Security (sql-security.utils)', () => {
        describe('validateColumnName', () => {
            it('allows valid column names', () => {
                expect(() => validateColumnName('id')).not.toThrow();
                expect(() => validateColumnName('user_name')).not.toThrow();
                expect(() => validateColumnName('firstName')).not.toThrow();
                expect(() => validateColumnName('column1')).not.toThrow();
            });

            it('rejects invalid column names', () => {
                expect(() => validateColumnName('1column')).toThrow();
                expect(() => validateColumnName('user-name')).toThrow();
                expect(() => validateColumnName('user name')).toThrow();
                expect(() => validateColumnName('')).toThrow();
                expect(() => validateColumnName('a'.repeat(129))).toThrow();
            });

            it('rejects SQL injection attempts', () => {
                expect(() => validateColumnName("column'; DROP TABLE users;--")).toThrow();
                expect(() => validateColumnName('column/**/OR/**/1=1')).toThrow();
            });
        });

        describe('validateTableName', () => {
            it('allows valid table names', () => {
                expect(() => validateTableName('users')).not.toThrow();
                expect(() => validateTableName('order_items')).not.toThrow();
                expect(() => validateTableName('schema_name.table_name')).not.toThrow();
            });

            it('rejects invalid table names', () => {
                expect(() => validateTableName('')).toThrow();
                expect(() => validateTableName('123table')).toThrow();
                expect(() => validateTableName('table name')).toThrow();
            });
        });

        describe('containsSqlInjection', () => {
            it('detects common SQL injection patterns', () => {
                expect(containsSqlInjection("; DROP TABLE users;")).toBe(true);
                expect(containsSqlInjection("1' OR '1'='1' OR '1")).toBe(true);
                expect(containsSqlInjection('1 UNION SELECT * FROM users')).toBe(true);
                expect(containsSqlInjection("admin--")).toBe(true);
                expect(containsSqlInjection('; DELETE FROM users')).toBe(true);
            });

            it('allows safe strings', () => {
                expect(containsSqlInjection('John Doe')).toBe(false);
                expect(containsSqlInjection('user@example.com')).toBe(false);
                expect(containsSqlInjection('Product Description')).toBe(false);
            });
        });

        describe('escapeSqlIdentifier', () => {
            it('escapes identifiers with double quotes', () => {
                expect(escapeSqlIdentifier('column_name')).toBe('"column_name"');
                expect(escapeSqlIdentifier('user_name')).toBe('"user_name"');
            });
        });
    });
});

describe('DataHub Plugin E2E', () => {
    const { server, adminClient } = createDataHubTestEnvironment();

    beforeAll(async () => {
        await server.init({
            initialData: {
                defaultLanguage: 'en',
                defaultZone: 'Europe',
            },
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
    });

    afterAll(async () => {
        await server.destroy();
    });

    describe('Pipeline Definition Validation', () => {
        it('validates pipeline with missing extractor', async () => {
            const { validateDataHubPipelineDefinition } = await adminClient.query(gql`
                mutation ValidateDefinition($input: JSON!) {
                    validateDataHubPipelineDefinition(definition: $input) {
                        isValid
                        issues {
                            message
                            reason
                            stepKey
                        }
                    }
                }
            `, {
                input: {
                    version: 1,
                    steps: [
                        {
                            key: 'transform',
                            type: 'TRANSFORM',
                            config: { operator: 'trim', field: 'name' },
                        },
                    ],
                    edges: [],
                },
            });

            expect(validateDataHubPipelineDefinition.isValid).toBe(false);
            expect(validateDataHubPipelineDefinition.issues.length).toBeGreaterThan(0);
        });

        it('validates pipeline with circular dependency', async () => {
            const { validateDataHubPipelineDefinition } = await adminClient.query(gql`
                mutation ValidateDefinition($input: JSON!) {
                    validateDataHubPipelineDefinition(definition: $input) {
                        isValid
                        issues {
                            message
                            reason
                        }
                    }
                }
            `, {
                input: {
                    version: 1,
                    steps: [
                        { key: 'a', type: 'TRANSFORM', config: { operator: 'passthrough' } },
                        { key: 'b', type: 'TRANSFORM', config: { operator: 'passthrough' } },
                    ],
                    edges: [
                        { from: 'a', to: 'b' },
                        { from: 'b', to: 'a' },
                    ],
                },
            });

            expect(validateDataHubPipelineDefinition.isValid).toBe(false);
            expect(
                validateDataHubPipelineDefinition.issues.some(
                    (i: any) => i.message.toLowerCase().includes('cycle') ||
                                i.message.toLowerCase().includes('circular')
                )
            ).toBe(true);
        });

        it('accepts valid pipeline definition', async () => {
            const { validateDataHubPipelineDefinition } = await adminClient.query(gql`
                mutation ValidateDefinition($input: JSON!) {
                    validateDataHubPipelineDefinition(definition: $input) {
                        isValid
                        issues {
                            message
                            stepKey
                            field
                        }
                    }
                }
            `, {
                input: {
                    version: 1,
                    steps: [
                        {
                            key: 'source',
                            type: 'EXTRACT',
                            config: {
                                adapterCode: 'vendureQuery',
                                entity: 'Product',
                            },
                        },
                    ],
                    edges: [],
                },
            });

            expect(validateDataHubPipelineDefinition.isValid).toBe(true);
            expect(validateDataHubPipelineDefinition.issues).toHaveLength(0);
        });
    });

    describe('Adapter Registry', () => {
        it('lists available adapters', async () => {
            const { dataHubAdapters } = await adminClient.query(gql`
                query {
                    dataHubAdapters {
                        code
                        type
                    }
                }
            `);

            expect(dataHubAdapters.length).toBeGreaterThan(0);

            // Check extractors exist
            expect(dataHubAdapters.some((a: any) => a.type === 'extractor')).toBe(true);

            // Check operators exist
            expect(dataHubAdapters.some((a: any) => a.type === 'operator')).toBe(true);
            expect(dataHubAdapters.some((a: any) => a.code === 'trim')).toBe(true);

            // Check loaders exist
            expect(dataHubAdapters.some((a: any) => a.type === 'loader')).toBe(true);
        });

        it('includes expected extractors', async () => {
            const { dataHubAdapters } = await adminClient.query(gql`
                query {
                    dataHubAdapters {
                        code
                        type
                        name
                    }
                }
            `);

            const extractors = dataHubAdapters.filter((a: any) => a.type === 'extractor');
            expect(extractors.length).toBeGreaterThan(0);

            // Check vendureQuery extractor exists (standard extractor)
            expect(extractors.some((e: any) => e.code === 'vendureQuery')).toBe(true);
        });
    });

    describe('Secrets Management', () => {
        let secretId: string;

        it('creates a secret', async () => {
            const { createDataHubSecret } = await adminClient.query(gql`
                mutation CreateSecret($input: CreateDataHubSecretInput!) {
                    createDataHubSecret(input: $input) {
                        id
                        code
                        provider
                    }
                }
            `, {
                input: {
                    code: 'test-api-key',
                    value: 'secret-value-12345',
                    provider: 'VENDURE',
                },
            });

            expect(createDataHubSecret.code).toBe('test-api-key');
            expect(createDataHubSecret.provider).toBe('VENDURE');
            secretId = createDataHubSecret.id;
        });

        it('lists secrets', async () => {
            const { dataHubSecrets } = await adminClient.query(gql`
                query {
                    dataHubSecrets {
                        items {
                            id
                            code
                            provider
                        }
                        totalItems
                    }
                }
            `);

            expect(dataHubSecrets.items.some((s: any) => s.code === 'test-api-key')).toBe(true);
            expect(dataHubSecrets.totalItems).toBeGreaterThan(0);
        });

        it('deletes a secret', async () => {
            const { deleteDataHubSecret } = await adminClient.query(gql`
                mutation DeleteSecret($id: ID!) {
                    deleteDataHubSecret(id: $id) {
                        result
                        message
                    }
                }
            `, { id: secretId });

            expect(deleteDataHubSecret.result).toBe('DELETED');
        });
    });

    describe('Connections Management', () => {
        let connectionId: string;

        it('creates a connection', async () => {
            const { createDataHubConnection } = await adminClient.query(gql`
                mutation CreateConnection($input: CreateDataHubConnectionInput!) {
                    createDataHubConnection(input: $input) {
                        id
                        code
                        type
                    }
                }
            `, {
                input: {
                    code: 'test-http-connection',
                    type: 'HTTP',
                    config: {
                        baseUrl: 'https://api.example.com',
                    },
                },
            });

            expect(createDataHubConnection.code).toBe('test-http-connection');
            expect(createDataHubConnection.type).toBe('HTTP');
            connectionId = createDataHubConnection.id;
        });

        it('lists connections', async () => {
            const { dataHubConnections } = await adminClient.query(gql`
                query {
                    dataHubConnections {
                        items {
                            id
                            code
                            type
                        }
                        totalItems
                    }
                }
            `);

            expect(dataHubConnections.items.some((c: any) => c.code === 'test-http-connection')).toBe(true);
        });

        it('deletes a connection', async () => {
            const { deleteDataHubConnection } = await adminClient.query(gql`
                mutation DeleteConnection($id: ID!) {
                    deleteDataHubConnection(id: $id) {
                        result
                        message
                    }
                }
            `, { id: connectionId });

            expect(deleteDataHubConnection.result).toBe('DELETED');
        });
    });

    describe('Pipeline CRUD', () => {
        let pipelineId: string;

        it('creates a pipeline with valid definition', async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) {
                        id
                        code
                        enabled
                    }
                }
            `, {
                input: {
                    code: 'test-security-pipeline',
                    name: 'Security Test Pipeline',
                    definition: {
                        version: 1,
                        steps: [
                            {
                                key: 'source',
                                type: 'EXTRACT',
                                config: {
                                    adapterCode: 'vendureQuery',
                                    entity: 'Product',
                                },
                            },
                        ],
                        edges: [],
                    },
                },
            });

            expect(createDataHubPipeline.code).toBe('test-security-pipeline');
            expect(createDataHubPipeline.enabled).toBe(true);
            pipelineId = createDataHubPipeline.id;
        });

        it('gets pipeline by id', async () => {
            // Skip if pipeline creation failed
            if (!pipelineId) {
                return;
            }
            const { dataHubPipeline } = await adminClient.query(gql`
                query GetPipeline($id: ID!) {
                    dataHubPipeline(id: $id) {
                        id
                        code
                        definition
                    }
                }
            `, { id: pipelineId });

            expect(dataHubPipeline.code).toBe('test-security-pipeline');
            expect(dataHubPipeline.definition.steps).toHaveLength(1);
        });

        it('deletes pipeline', async () => {
            // Skip if pipeline creation failed
            if (!pipelineId) {
                return;
            }
            const { deleteDataHubPipeline } = await adminClient.query(gql`
                mutation DeletePipeline($id: ID!) {
                    deleteDataHubPipeline(id: $id) {
                        result
                    }
                }
            `, { id: pipelineId });

            expect(deleteDataHubPipeline.result).toBe('DELETED');
        });
    });
});

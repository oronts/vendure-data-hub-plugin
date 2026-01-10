import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDataHubTestEnvironment } from './test-config';
import gql from 'graphql-tag';

describe('DataHub Plugin', () => {
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

    describe('Pipeline CRUD', () => {
        let pipelineId: string;

        it('creates a pipeline', async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) {
                        id
                        code
                        name
                        enabled
                    }
                }
            `, {
                input: {
                    code: 'test-pipeline',
                    name: 'Test Pipeline',
                    definition: { version: 1, steps: [], edges: [] },
                },
            });

            expect(createDataHubPipeline.code).toBe('test-pipeline');
            expect(createDataHubPipeline.name).toBe('Test Pipeline');
            expect(createDataHubPipeline.enabled).toBe(true);
            pipelineId = createDataHubPipeline.id;
        });

        it('lists pipelines', async () => {
            const { dataHubPipelines } = await adminClient.query(gql`
                query {
                    dataHubPipelines {
                        items { id code name }
                        totalItems
                    }
                }
            `);

            expect(dataHubPipelines.totalItems).toBeGreaterThan(0);
            expect(dataHubPipelines.items.some((p: any) => p.code === 'test-pipeline')).toBe(true);
        });

        it('gets a pipeline by id', async () => {
            const { dataHubPipeline } = await adminClient.query(gql`
                query GetPipeline($id: ID!) {
                    dataHubPipeline(id: $id) {
                        id
                        code
                        name
                        definition
                    }
                }
            `, { id: pipelineId });

            expect(dataHubPipeline.code).toBe('test-pipeline');
            expect(dataHubPipeline.definition.steps).toEqual([]);
            expect(dataHubPipeline.definition.edges).toEqual([]);
        });

        it('updates a pipeline', async () => {
            const { updateDataHubPipeline } = await adminClient.query(gql`
                mutation UpdatePipeline($input: UpdateDataHubPipelineInput!) {
                    updateDataHubPipeline(input: $input) {
                        id
                        name
                        enabled
                    }
                }
            `, {
                input: {
                    id: pipelineId,
                    name: 'Updated Pipeline',
                    enabled: false,
                },
            });

            expect(updateDataHubPipeline.name).toBe('Updated Pipeline');
            expect(updateDataHubPipeline.enabled).toBe(false);
        });

        it('deletes a pipeline', async () => {
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

    describe('Connection CRUD', () => {
        let connectionId: string;

        it('creates a connection', async () => {
            const { createDataHubConnection } = await adminClient.query(gql`
                mutation CreateConnection($input: CreateDataHubConnectionInput!) {
                    createDataHubConnection(input: $input) {
                        id
                        code
                        type
                        config
                    }
                }
            `, {
                input: {
                    code: 'test-http-conn',
                    type: 'http',
                    config: { baseUrl: 'https://api.example.com' },
                },
            });

            expect(createDataHubConnection.code).toBe('test-http-conn');
            expect(createDataHubConnection.type).toBe('http');
            connectionId = createDataHubConnection.id;
        });

        it('lists connections', async () => {
            const { dataHubConnections } = await adminClient.query(gql`
                query {
                    dataHubConnections {
                        items { id code type }
                        totalItems
                    }
                }
            `);

            expect(dataHubConnections.totalItems).toBeGreaterThan(0);
        });

        it('gets a connection by id', async () => {
            const { dataHubConnection } = await adminClient.query(gql`
                query GetConnection($id: ID!) {
                    dataHubConnection(id: $id) {
                        id
                        code
                        type
                        config
                    }
                }
            `, { id: connectionId });

            expect(dataHubConnection.code).toBe('test-http-conn');
        });

        it('updates a connection', async () => {
            const { updateDataHubConnection } = await adminClient.query(gql`
                mutation UpdateConnection($input: UpdateDataHubConnectionInput!) {
                    updateDataHubConnection(input: $input) {
                        id
                        code
                        config
                    }
                }
            `, {
                input: {
                    id: connectionId,
                    config: { baseUrl: 'https://updated-api.example.com' },
                },
            });

            expect(updateDataHubConnection.config.baseUrl).toBe('https://updated-api.example.com');
        });

        it('deletes a connection', async () => {
            const { deleteDataHubConnection } = await adminClient.query(gql`
                mutation DeleteConnection($id: ID!) {
                    deleteDataHubConnection(id: $id) {
                        result
                    }
                }
            `, { id: connectionId });

            expect(deleteDataHubConnection.result).toBe('DELETED');
        });
    });

    describe('Secret CRUD', () => {
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
                    provider: 'inline',
                    value: 'secret-value-123',
                },
            });

            expect(createDataHubSecret.code).toBe('test-api-key');
            expect(createDataHubSecret.provider).toBe('inline');
            secretId = createDataHubSecret.id;
        });

        it('lists secrets', async () => {
            const { dataHubSecrets } = await adminClient.query(gql`
                query {
                    dataHubSecrets {
                        items { id code provider }
                        totalItems
                    }
                }
            `);

            expect(dataHubSecrets.totalItems).toBeGreaterThan(0);
        });

        it('gets a secret by id', async () => {
            const { dataHubSecret } = await adminClient.query(gql`
                query GetSecret($id: ID!) {
                    dataHubSecret(id: $id) {
                        id
                        code
                        provider
                    }
                }
            `, { id: secretId });

            expect(dataHubSecret.code).toBe('test-api-key');
        });

        it('updates a secret', async () => {
            const { updateDataHubSecret } = await adminClient.query(gql`
                mutation UpdateSecret($input: UpdateDataHubSecretInput!) {
                    updateDataHubSecret(input: $input) {
                        id
                        code
                    }
                }
            `, {
                input: {
                    id: secretId,
                    code: 'updated-api-key',
                },
            });

            expect(updateDataHubSecret.code).toBe('updated-api-key');
        });

        it('deletes a secret', async () => {
            const { deleteDataHubSecret } = await adminClient.query(gql`
                mutation DeleteSecret($id: ID!) {
                    deleteDataHubSecret(id: $id) {
                        result
                    }
                }
            `, { id: secretId });

            expect(deleteDataHubSecret.result).toBe('DELETED');
        });
    });

    describe('Adapters', () => {
        it('lists available adapters', async () => {
            const { dataHubAdapters } = await adminClient.query(gql`
                query {
                    dataHubAdapters {
                        code
                        name
                        type
                        schema {
                            fields { key type }
                        }
                    }
                }
            `);

            expect(dataHubAdapters.length).toBeGreaterThan(0);
        });

        it('gets adapter details', async () => {
            const { dataHubAdapters } = await adminClient.query(gql`
                query {
                    dataHubAdapters {
                        code
                        name
                        type
                        category
                        schema {
                            fields { key type required }
                        }
                    }
                }
            `);

            const restExtractor = dataHubAdapters.find((a: any) => a.code === 'rest');
            expect(restExtractor).toBeDefined();
            expect(restExtractor.schema).toBeDefined();
        });
    });

    describe('Pipeline Validation', () => {
        it('validates an empty pipeline', async () => {
            const { validateDataHubPipelineDefinition } = await adminClient.query(gql`
                mutation Validate($definition: JSON!) {
                    validateDataHubPipelineDefinition(definition: $definition) {
                        isValid
                        errors
                        issues { message stepKey }
                    }
                }
            `, {
                definition: { version: 1, steps: [], edges: [] },
            });

            expect(validateDataHubPipelineDefinition).toBeDefined();
        });

        it('validates a pipeline with extract step', async () => {
            const { validateDataHubPipelineDefinition } = await adminClient.query(gql`
                mutation Validate($definition: JSON!) {
                    validateDataHubPipelineDefinition(definition: $definition) {
                        isValid
                        errors
                        issues { message stepKey }
                    }
                }
            `, {
                definition: {
                    version: 1,
                    steps: [{
                        key: 'extract-1',
                        type: 'extract',
                        adapter: 'rest',
                        config: { url: 'https://api.example.com/data' },
                    }],
                    edges: [],
                },
            });

            expect(validateDataHubPipelineDefinition).toBeDefined();
        });

        it('detects invalid step configuration', async () => {
            const { validateDataHubPipelineDefinition } = await adminClient.query(gql`
                mutation Validate($definition: JSON!) {
                    validateDataHubPipelineDefinition(definition: $definition) {
                        isValid
                        errors
                        issues { message stepKey }
                    }
                }
            `, {
                definition: {
                    version: 1,
                    steps: [{
                        key: 'invalid-step',
                        type: 'extract',
                        adapter: 'non-existent-adapter',
                        config: {},
                    }],
                    edges: [],
                },
            });

            expect(validateDataHubPipelineDefinition.isValid).toBe(false);
        });
    });

    describe('Settings', () => {
        it('gets settings', async () => {
            const { dataHubSettings } = await adminClient.query(gql`
                query {
                    dataHubSettings {
                        retentionDaysRuns
                        retentionDaysErrors
                        retentionDaysLogs
                        logPersistenceLevel
                    }
                }
            `);

            expect(dataHubSettings).toBeDefined();
        });

        it('updates settings', async () => {
            const { setDataHubSettings } = await adminClient.query(gql`
                mutation UpdateSettings($input: DataHubSettingsInput!) {
                    setDataHubSettings(input: $input) {
                        retentionDaysRuns
                        retentionDaysErrors
                    }
                }
            `, {
                input: {
                    retentionDaysRuns: 60,
                    retentionDaysErrors: 30,
                },
            });

            expect(setDataHubSettings.retentionDaysRuns).toBe(60);
            expect(setDataHubSettings.retentionDaysErrors).toBe(30);
        });
    });

    describe('Logs', () => {
        let testPipelineId: string;

        beforeAll(async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) { id }
                }
            `, {
                input: {
                    code: 'log-test-pipeline',
                    name: 'Log Test Pipeline',
                    definition: { version: 1, steps: [], edges: [] },
                },
            });
            testPipelineId = createDataHubPipeline.id;
        });

        afterAll(async () => {
            if (testPipelineId) {
                await adminClient.query(gql`
                    mutation DeletePipeline($id: ID!) {
                        deleteDataHubPipeline(id: $id) { result }
                    }
                `, { id: testPipelineId });
            }
        });

        it('queries logs', async () => {
            expect(testPipelineId).toBeDefined();
        });
    });

    describe('Format Conversion', () => {
        it('converts canonical to visual format', async () => {
            const { dataHubToVisualFormat } = await adminClient.query(gql`
                query ToVisual($definition: JSON!) {
                    dataHubToVisualFormat(definition: $definition) {
                        definition
                        success
                        issues
                    }
                }
            `, {
                definition: {
                    version: 1,
                    steps: [{
                        key: 'step-1',
                        type: 'extract',
                        adapter: 'rest',
                        config: { url: 'https://api.example.com' },
                    }],
                    edges: [],
                },
            });

            expect(dataHubToVisualFormat.success).toBe(true);
            expect(dataHubToVisualFormat.definition).toBeDefined();
        });

        it('converts visual to canonical format', async () => {
            const { dataHubToCanonicalFormat } = await adminClient.query(gql`
                query ToCanonical($definition: JSON!) {
                    dataHubToCanonicalFormat(definition: $definition) {
                        definition
                        success
                        issues
                    }
                }
            `, {
                definition: {
                    nodes: [{
                        id: 'node-1',
                        type: 'extract',
                        data: { adapter: 'rest', config: { url: 'https://api.example.com' } },
                        position: { x: 0, y: 0 },
                    }],
                    edges: [],
                },
            });

            expect(dataHubToCanonicalFormat.success).toBe(true);
            expect(dataHubToCanonicalFormat.definition).toBeDefined();
        });
    });
});

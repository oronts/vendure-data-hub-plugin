import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDataHubTestEnvironment } from './test-config';
import gql from 'graphql-tag';

describe('DataHub Error Recovery', () => {
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

    describe('Error Recording', () => {
        let pipelineId: string;

        beforeAll(async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) { id }
                }
            `, {
                input: {
                    code: 'error-recording-pipeline',
                    name: 'Error Recording Pipeline',
                    definition: {
                        version: 1,
                        steps: [{
                            key: 'extract',
                            type: 'extract',
                            adapter: 'inline',
                            config: {
                                data: [
                                    { id: 1, name: 'Valid Product' },
                                    { id: null, name: null },
                                ],
                            },
                        }],
                        edges: [],
                    },
                },
            });
            pipelineId = createDataHubPipeline.id;
        });

        afterAll(async () => {
            if (pipelineId) {
                await adminClient.query(gql`
                    mutation DeletePipeline($id: ID!) {
                        deleteDataHubPipeline(id: $id) { result }
                    }
                `, { id: pipelineId });
            }
        });

        it('records errors during pipeline execution', async () => {
            const { runDataHubPipeline } = await adminClient.query(gql`
                mutation RunPipeline($id: ID!) {
                    runDataHubPipeline(pipelineId: $id) {
                        id
                        status
                        recordsProcessed
                        recordsFailed
                    }
                }
            `, { id: pipelineId });

            expect(runDataHubPipeline.id).toBeDefined();
        });
    });

    describe('Error Retry', () => {
        it('queries retryable errors', async () => {
            const { dataHubRecordErrors } = await adminClient.query(gql`
                query {
                    dataHubRecordErrors(options: { take: 10, filter: { retryable: { eq: true } } }) {
                        items {
                            id
                            errorMessage
                            retryCount
                        }
                        totalItems
                    }
                }
            `);

            expect(dataHubRecordErrors.items).toBeDefined();
        });

        it('retries failed records', async () => {
            const { dataHubRecordErrors } = await adminClient.query(gql`
                query {
                    dataHubRecordErrors(options: { take: 1, filter: { retryable: { eq: true } } }) {
                        items { id }
                    }
                }
            `);

            if (dataHubRecordErrors.items.length > 0) {
                const errorId = dataHubRecordErrors.items[0].id;

                const { retryDataHubRecordError } = await adminClient.query(gql`
                    mutation Retry($id: ID!) {
                        retryDataHubRecordError(id: $id) {
                            id
                            retryCount
                        }
                    }
                `, { id: errorId });

                expect(retryDataHubRecordError).toBeDefined();
            }
        });
    });

    describe('Error Aggregation', () => {
        it('gets top errors by frequency', async () => {
            const { dataHubTopErrors } = await adminClient.query(gql`
                query {
                    dataHubTopErrors(limit: 10) {
                        errorMessage
                        count
                        lastOccurrence
                    }
                }
            `);

            expect(dataHubTopErrors).toBeDefined();
        });

        it('gets errors by pipeline', async () => {
            const { dataHubErrorsByPipeline } = await adminClient.query(gql`
                query {
                    dataHubErrorsByPipeline {
                        pipelineCode
                        totalErrors
                        recentErrors
                    }
                }
            `);

            expect(dataHubErrorsByPipeline).toBeDefined();
        });
    });

    describe('Error Handling Modes', () => {
        it('creates pipeline with skip error handling', async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) { id code }
                }
            `, {
                input: {
                    code: 'skip-errors-pipeline',
                    name: 'Skip Errors Pipeline',
                    definition: {
                        version: 1,
                        context: {
                            errorHandling: {
                                mode: 'skip',
                                maxErrors: 100,
                            },
                        },
                        steps: [{
                            key: 'extract',
                            type: 'extract',
                            adapter: 'inline',
                            config: { data: [] },
                        }],
                        edges: [],
                    },
                },
            });

            expect(createDataHubPipeline.code).toBe('skip-errors-pipeline');

            // Cleanup
            await adminClient.query(gql`
                mutation DeletePipeline($id: ID!) {
                    deleteDataHubPipeline(id: $id) { result }
                }
            `, { id: createDataHubPipeline.id });
        });

        it('creates pipeline with fail error handling', async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) { id code }
                }
            `, {
                input: {
                    code: 'fail-errors-pipeline',
                    name: 'Fail Errors Pipeline',
                    definition: {
                        version: 1,
                        context: {
                            errorHandling: {
                                mode: 'fail',
                            },
                        },
                        steps: [{
                            key: 'extract',
                            type: 'extract',
                            adapter: 'inline',
                            config: { data: [] },
                        }],
                        edges: [],
                    },
                },
            });

            expect(createDataHubPipeline.code).toBe('fail-errors-pipeline');

            // Cleanup
            await adminClient.query(gql`
                mutation DeletePipeline($id: ID!) {
                    deleteDataHubPipeline(id: $id) { result }
                }
            `, { id: createDataHubPipeline.id });
        });
    });

    describe('Error Purge', () => {
        it('purges old errors', async () => {
            const { purgeDataHubRecordErrors } = await adminClient.query(gql`
                mutation Purge($olderThanDays: Int!) {
                    purgeDataHubRecordErrors(olderThanDays: $olderThanDays) {
                        purgedCount
                    }
                }
            `, { olderThanDays: 365 });

            expect(purgeDataHubRecordErrors.purgedCount).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Checkpoint Recovery', () => {
        let pipelineId: string;

        beforeAll(async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) { id }
                }
            `, {
                input: {
                    code: 'checkpoint-test-pipeline',
                    name: 'Checkpoint Test Pipeline',
                    definition: {
                        version: 1,
                        context: {
                            checkpoint: {
                                enabled: true,
                                keyField: 'id',
                            },
                        },
                        steps: [{
                            key: 'extract',
                            type: 'extract',
                            adapter: 'inline',
                            config: {
                                data: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` })),
                            },
                        }],
                        edges: [],
                    },
                },
            });
            pipelineId = createDataHubPipeline.id;
        });

        afterAll(async () => {
            if (pipelineId) {
                await adminClient.query(gql`
                    mutation DeletePipeline($id: ID!) {
                        deleteDataHubPipeline(id: $id) { result }
                    }
                `, { id: pipelineId });
            }
        });

        it('queries checkpoints', async () => {
            const { dataHubCheckpoints } = await adminClient.query(gql`
                query GetCheckpoints($pipelineId: ID!) {
                    dataHubCheckpoints(pipelineId: $pipelineId) {
                        items {
                            id
                            stepKey
                            value
                            processedCount
                        }
                        totalItems
                    }
                }
            `, { pipelineId });

            expect(dataHubCheckpoints.items).toBeDefined();
        });

        it('clears checkpoint', async () => {
            const { clearDataHubCheckpoint } = await adminClient.query(gql`
                mutation ClearCheckpoint($pipelineId: ID!) {
                    clearDataHubCheckpoint(pipelineId: $pipelineId) {
                        success
                    }
                }
            `, { pipelineId });

            expect(clearDataHubCheckpoint.success).toBe(true);
        });
    });

    describe('Run History and Logs', () => {
        it('queries run history', async () => {
            const { dataHubRunHistory } = await adminClient.query(gql`
                query {
                    dataHubRunHistory(options: { take: 10 }) {
                        items {
                            id
                            pipelineCode
                            status
                            startedAt
                            completedAt
                            recordsProcessed
                            recordsFailed
                        }
                        totalItems
                    }
                }
            `);

            expect(dataHubRunHistory.items).toBeDefined();
        });

        it('queries logs for run', async () => {
            const { dataHubRunHistory } = await adminClient.query(gql`
                query {
                    dataHubRunHistory(options: { take: 1 }) {
                        items { id }
                    }
                }
            `);

            if (dataHubRunHistory.items.length > 0) {
                const runId = dataHubRunHistory.items[0].id;

                const { dataHubRunLogs } = await adminClient.query(gql`
                    query GetLogs($runId: ID!) {
                        dataHubRunLogs(runId: $runId, options: { take: 50 }) {
                            items {
                                id
                                level
                                message
                                timestamp
                            }
                            totalItems
                        }
                    }
                `, { runId });

                expect(dataHubRunLogs.items).toBeDefined();
            }
        });
    });
});

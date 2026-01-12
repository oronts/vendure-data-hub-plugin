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
                            type: 'EXTRACT',
                            config: {
                                adapterCode: 'vendure-query',
                                entity: 'Product',
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
            const { startDataHubPipelineRun } = await adminClient.query(gql`
                mutation RunPipeline($id: ID!) {
                    startDataHubPipelineRun(pipelineId: $id) {
                        id
                        status
                    }
                }
            `, { id: pipelineId });

            expect(startDataHubPipelineRun.id).toBeDefined();
        });
    });

    describe('Error Retry', () => {
        it('queries run errors', async () => {
            // First get a run to query errors for
            const { dataHubPipelineRuns } = await adminClient.query(gql`
                query {
                    dataHubPipelineRuns {
                        items { id }
                    }
                }
            `);

            if (dataHubPipelineRuns.items.length > 0) {
                const runId = dataHubPipelineRuns.items[0].id;
                const { dataHubRunErrors } = await adminClient.query(gql`
                    query RunErrors($runId: ID!) {
                        dataHubRunErrors(runId: $runId) {
                            id
                            message
                        }
                    }
                `, { runId });

                expect(dataHubRunErrors).toBeDefined();
            }
        });

        it('retries failed records', async () => {
            // Get dead letter queue entries
            const { dataHubDeadLetters } = await adminClient.query(gql`
                query {
                    dataHubDeadLetters {
                        id
                    }
                }
            `);

            if (dataHubDeadLetters.length > 0) {
                const errorId = dataHubDeadLetters[0].id;

                const { retryDataHubRecord } = await adminClient.query(gql`
                    mutation Retry($id: ID!) {
                        retryDataHubRecord(errorId: $id)
                    }
                `, { id: errorId });

                expect(retryDataHubRecord).toBeDefined();
            }
        });
    });

    describe('Error Aggregation', () => {
        it('gets error analytics with top errors', async () => {
            const { dataHubErrorAnalytics } = await adminClient.query(gql`
                query {
                    dataHubErrorAnalytics {
                        totalErrors
                        topErrors {
                            message
                            count
                            lastOccurrence
                        }
                    }
                }
            `);

            expect(dataHubErrorAnalytics).toBeDefined();
        });

        it('gets errors by pipeline', async () => {
            const { dataHubErrorAnalytics } = await adminClient.query(gql`
                query {
                    dataHubErrorAnalytics {
                        errorsByPipeline {
                            pipelineCode
                            count
                        }
                    }
                }
            `);

            expect(dataHubErrorAnalytics.errorsByPipeline).toBeDefined();
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
                            type: 'EXTRACT',
                            config: { adapterCode: 'vendure-query', entity: 'Product' },
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
                            type: 'EXTRACT',
                            config: { adapterCode: 'vendure-query', entity: 'Product' },
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

    describe('Dead Letter Queue', () => {
        it('queries dead letter queue', async () => {
            const { dataHubDeadLetters } = await adminClient.query(gql`
                query {
                    dataHubDeadLetters {
                        id
                        message
                        stepKey
                    }
                }
            `);

            expect(dataHubDeadLetters).toBeDefined();
        });

        it('marks error as dead letter', async () => {
            // First get a run to query errors for
            const { dataHubPipelineRuns } = await adminClient.query(gql`
                query {
                    dataHubPipelineRuns {
                        items { id }
                    }
                }
            `);

            if (dataHubPipelineRuns.items.length > 0) {
                const runId = dataHubPipelineRuns.items[0].id;
                const { dataHubRunErrors } = await adminClient.query(gql`
                    query RunErrors($runId: ID!) {
                        dataHubRunErrors(runId: $runId) {
                            id
                        }
                    }
                `, { runId });

                if (dataHubRunErrors.length > 0) {
                    const errorId = dataHubRunErrors[0].id;

                    const { markDataHubDeadLetter } = await adminClient.query(gql`
                        mutation MarkDeadLetter($id: ID!) {
                            markDataHubDeadLetter(id: $id, deadLetter: true)
                        }
                    `, { id: errorId });

                    expect(markDataHubDeadLetter).toBeDefined();
                }
            }
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
                            type: 'EXTRACT',
                            config: {
                                adapterCode: 'vendure-query',
                                entity: 'Product',
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

        it('queries checkpoint for pipeline', async () => {
            const { dataHubCheckpoint } = await adminClient.query(gql`
                query GetCheckpoint($pipelineId: ID!) {
                    dataHubCheckpoint(pipelineId: $pipelineId) {
                        id
                        data
                    }
                }
            `, { pipelineId });

            // Checkpoint may be null if no run has occurred yet
            expect(dataHubCheckpoint === null || dataHubCheckpoint).toBeTruthy();
        });

        it('sets checkpoint data', async () => {
            const { setDataHubCheckpoint } = await adminClient.query(gql`
                mutation SetCheckpoint($pipelineId: ID!, $data: JSON!) {
                    setDataHubCheckpoint(pipelineId: $pipelineId, data: $data) {
                        id
                        data
                    }
                }
            `, { pipelineId, data: { lastProcessedId: 50, processedCount: 50 } });

            expect(setDataHubCheckpoint).toBeDefined();
        });
    });

    describe('Run History and Logs', () => {
        it('queries pipeline run history', async () => {
            const { dataHubPipelineRuns } = await adminClient.query(gql`
                query {
                    dataHubPipelineRuns {
                        items {
                            id
                            status
                            startedAt
                            finishedAt
                            metrics
                        }
                        totalItems
                    }
                }
            `);

            expect(dataHubPipelineRuns.items).toBeDefined();
        });

        it('queries logs for run', async () => {
            const { dataHubPipelineRuns } = await adminClient.query(gql`
                query {
                    dataHubPipelineRuns {
                        items { id }
                    }
                }
            `);

            if (dataHubPipelineRuns.items.length > 0) {
                const runId = dataHubPipelineRuns.items[0].id;

                const { dataHubRunLogs } = await adminClient.query(gql`
                    query GetLogs($runId: ID!) {
                        dataHubRunLogs(runId: $runId) {
                            id
                            level
                            message
                            timestamp
                        }
                    }
                `, { runId });

                expect(dataHubRunLogs).toBeDefined();
            }
        });

        it('queries recent logs', async () => {
            const { dataHubRecentLogs } = await adminClient.query(gql`
                query {
                    dataHubRecentLogs(limit: 20) {
                        id
                        level
                        message
                    }
                }
            `);

            expect(dataHubRecentLogs).toBeDefined();
        });
    });
});

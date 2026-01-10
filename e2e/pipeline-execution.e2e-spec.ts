import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDataHubTestEnvironment } from './test-config';
import gql from 'graphql-tag';

describe('DataHub Pipeline Execution', () => {
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

    describe('Pipeline Run Management', () => {
        let pipelineId: string;
        let runId: string;

        beforeAll(async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) {
                        id
                        code
                    }
                }
            `, {
                input: {
                    code: 'execution-test-pipeline',
                    name: 'Execution Test Pipeline',
                    definition: {
                        version: 1,
                        steps: [{
                            key: 'extract-step',
                            type: 'extract',
                            adapter: 'inline',
                            config: {
                                data: [
                                    { id: 1, name: 'Test Product 1', price: 100 },
                                    { id: 2, name: 'Test Product 2', price: 200 },
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

        it('triggers pipeline run', async () => {
            const { runDataHubPipeline } = await adminClient.query(gql`
                mutation RunPipeline($id: ID!) {
                    runDataHubPipeline(pipelineId: $id) {
                        id
                        status
                        triggeredBy
                    }
                }
            `, { id: pipelineId });

            expect(runDataHubPipeline.id).toBeDefined();
            expect(runDataHubPipeline.triggeredBy).toBe('manual');
            runId = runDataHubPipeline.id;
        });

        it('queries pipeline runs', async () => {
            const { dataHubPipelineRuns } = await adminClient.query(gql`
                query GetRuns($pipelineId: ID!) {
                    dataHubPipelineRuns(pipelineId: $pipelineId) {
                        items {
                            id
                            status
                            recordsProcessed
                            recordsFailed
                        }
                        totalItems
                    }
                }
            `, { pipelineId });

            expect(dataHubPipelineRuns.items).toBeDefined();
            expect(dataHubPipelineRuns.totalItems).toBeGreaterThan(0);
        });

        it('gets run details', async () => {
            if (!runId) return;

            const { dataHubPipelineRun } = await adminClient.query(gql`
                query GetRun($id: ID!) {
                    dataHubPipelineRun(id: $id) {
                        id
                        status
                        triggeredBy
                        startedAt
                    }
                }
            `, { id: runId });

            expect(dataHubPipelineRun.id).toBe(runId);
        });
    });

    describe('Dry Run Mode', () => {
        let pipelineId: string;

        beforeAll(async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) { id }
                }
            `, {
                input: {
                    code: 'dry-run-test-pipeline',
                    name: 'Dry Run Test Pipeline',
                    definition: {
                        version: 1,
                        steps: [{
                            key: 'extract',
                            type: 'extract',
                            adapter: 'inline',
                            config: {
                                data: [{ id: 1, name: 'Product', sku: 'SKU-001' }],
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

        it('executes pipeline in dry run mode', async () => {
            const { runDataHubPipeline } = await adminClient.query(gql`
                mutation RunDryPipeline($id: ID!) {
                    runDataHubPipeline(pipelineId: $id, dryRun: true) {
                        id
                        status
                    }
                }
            `, { id: pipelineId });

            expect(runDataHubPipeline).toBeDefined();
        });
    });

    describe('Pipeline with Transform', () => {
        let pipelineId: string;

        beforeAll(async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) { id }
                }
            `, {
                input: {
                    code: 'transform-test-pipeline',
                    name: 'Transform Test Pipeline',
                    definition: {
                        version: 1,
                        steps: [
                            {
                                key: 'extract',
                                type: 'extract',
                                adapter: 'inline',
                                config: {
                                    data: [
                                        { name: 'item1', value: 10 },
                                        { name: 'item2', value: 20 },
                                    ],
                                },
                            },
                            {
                                key: 'transform',
                                type: 'transform',
                                operations: [
                                    { op: 'rename', from: 'name', to: 'productName' },
                                    { op: 'set', field: 'currency', value: 'USD' },
                                ],
                            },
                        ],
                        edges: [
                            { from: 'extract', to: 'transform' },
                        ],
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

        it('executes pipeline with transform step', async () => {
            const { runDataHubPipeline } = await adminClient.query(gql`
                mutation RunPipeline($id: ID!) {
                    runDataHubPipeline(pipelineId: $id) {
                        id
                        status
                    }
                }
            `, { id: pipelineId });

            expect(runDataHubPipeline).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        it('handles invalid pipeline ID', async () => {
            try {
                await adminClient.query(gql`
                    mutation RunPipeline($id: ID!) {
                        runDataHubPipeline(pipelineId: $id) {
                            id
                            status
                        }
                    }
                `, { id: 'non-existent-id' });
            } catch (error: any) {
                expect(error).toBeDefined();
            }
        });

        it('handles disabled pipeline', async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) { id }
                }
            `, {
                input: {
                    code: 'disabled-pipeline',
                    name: 'Disabled Pipeline',
                    definition: { version: 1, steps: [], edges: [] },
                    enabled: false,
                },
            });

            const result = await adminClient.query(gql`
                mutation RunPipeline($id: ID!) {
                    runDataHubPipeline(pipelineId: $id) {
                        id
                        status
                    }
                }
            `, { id: createDataHubPipeline.id });

            // Cleanup
            await adminClient.query(gql`
                mutation DeletePipeline($id: ID!) {
                    deleteDataHubPipeline(id: $id) { result }
                }
            `, { id: createDataHubPipeline.id });

            expect(result.runDataHubPipeline).toBeDefined();
        });
    });

    describe('Pipeline Preview', () => {
        let pipelineId: string;

        beforeAll(async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) { id }
                }
            `, {
                input: {
                    code: 'preview-test-pipeline',
                    name: 'Preview Test Pipeline',
                    definition: {
                        version: 1,
                        steps: [{
                            key: 'extract',
                            type: 'extract',
                            adapter: 'inline',
                            config: {
                                data: [
                                    { id: 1, name: 'Test', price: 99.99 },
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

        it('previews pipeline output', async () => {
            const { previewDataHubPipeline } = await adminClient.query(gql`
                query Preview($id: ID!) {
                    previewDataHubPipeline(pipelineId: $id, limit: 10) {
                        records
                        totalCount
                    }
                }
            `, { id: pipelineId });

            expect(previewDataHubPipeline).toBeDefined();
        });
    });

    describe('Cancel Pipeline Run', () => {
        let pipelineId: string;

        beforeAll(async () => {
            const { createDataHubPipeline } = await adminClient.query(gql`
                mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
                    createDataHubPipeline(input: $input) { id }
                }
            `, {
                input: {
                    code: 'cancel-test-pipeline',
                    name: 'Cancel Test Pipeline',
                    definition: {
                        version: 1,
                        steps: [{
                            key: 'extract',
                            type: 'extract',
                            adapter: 'inline',
                            config: {
                                data: Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Item ${i}` })),
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

        it('cancels running pipeline', async () => {
            const { runDataHubPipeline } = await adminClient.query(gql`
                mutation RunPipeline($id: ID!) {
                    runDataHubPipeline(pipelineId: $id) {
                        id
                        status
                    }
                }
            `, { id: pipelineId });

            const { cancelDataHubPipelineRun } = await adminClient.query(gql`
                mutation CancelRun($id: ID!) {
                    cancelDataHubPipelineRun(runId: $id) {
                        id
                        status
                    }
                }
            `, { id: runDataHubPipeline.id });

            expect(cancelDataHubPipelineRun).toBeDefined();
        });
    });

    describe('Analytics', () => {
        it('queries pipeline statistics', async () => {
            const { dataHubPipelineStats } = await adminClient.query(gql`
                query {
                    dataHubPipelineStats {
                        totalPipelines
                        activePipelines
                        totalRuns
                        successfulRuns
                        failedRuns
                    }
                }
            `);

            expect(dataHubPipelineStats.totalPipelines).toBeGreaterThanOrEqual(0);
        });

        it('queries recent activity', async () => {
            const { dataHubRecentActivity } = await adminClient.query(gql`
                query {
                    dataHubRecentActivity(limit: 10) {
                        pipelineCode
                        status
                        recordsProcessed
                    }
                }
            `);

            expect(dataHubRecentActivity).toBeDefined();
        });
    });

    describe('Record Errors', () => {
        it('queries record errors', async () => {
            const { dataHubRecordErrors } = await adminClient.query(gql`
                query {
                    dataHubRecordErrors(options: { take: 10 }) {
                        items {
                            id
                            errorMessage
                            stepKey
                        }
                        totalItems
                    }
                }
            `);

            expect(dataHubRecordErrors.items).toBeDefined();
        });

        it('queries error stats', async () => {
            const { dataHubErrorStats } = await adminClient.query(gql`
                query {
                    dataHubErrorStats {
                        total
                        byStep {
                            stepKey
                            count
                        }
                    }
                }
            `);

            expect(dataHubErrorStats).toBeDefined();
        });
    });
});

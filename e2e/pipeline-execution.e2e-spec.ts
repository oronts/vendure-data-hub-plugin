import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDataHubTestEnvironment } from './test-config';
import gql from 'graphql-tag';
import { StepType } from '../src/constants/enums';

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
                            type: StepType.EXTRACT,
                            config: {
                                adapterCode: 'vendureQuery',
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

        it('triggers pipeline run', async () => {
            const { startDataHubPipelineRun } = await adminClient.query(gql`
                mutation RunPipeline($id: ID!) {
                    startDataHubPipelineRun(pipelineId: $id) {
                        id
                        status
                    }
                }
            `, { id: pipelineId });

            expect(startDataHubPipelineRun.id).toBeDefined();
            runId = startDataHubPipelineRun.id;
        });

        it('queries pipeline runs', async () => {
            const { dataHubPipelineRuns } = await adminClient.query(gql`
                query GetRuns($pipelineId: ID!) {
                    dataHubPipelineRuns(pipelineId: $pipelineId) {
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
            `, { pipelineId });

            expect(dataHubPipelineRuns.items).toBeDefined();
            expect(dataHubPipelineRuns.totalItems).toBeGreaterThanOrEqual(0);
        });

        it('gets run details', async () => {
            // Ensure runId was set by the previous test
            expect(runId).toBeDefined();

            const { dataHubPipelineRun } = await adminClient.query(gql`
                query GetRun($id: ID!) {
                    dataHubPipelineRun(id: $id) {
                        id
                        status
                        startedAt
                    }
                }
            `, { id: runId });

            expect(dataHubPipelineRun.id).toBe(runId);
            expect(dataHubPipelineRun.status).toBeDefined();
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
                            type: StepType.EXTRACT,
                            config: {
                                adapterCode: 'vendureQuery',
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

        it('executes pipeline in dry run mode', async () => {
            const { startDataHubPipelineDryRun } = await adminClient.query(gql`
                mutation RunDryPipeline($id: ID!) {
                    startDataHubPipelineDryRun(pipelineId: $id) {
                        metrics
                        notes
                    }
                }
            `, { id: pipelineId });

            expect(startDataHubPipelineDryRun).toMatchObject({
                metrics: expect.any(Object),
                notes: expect.any(Array),
            });
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
                                type: StepType.EXTRACT,
                                config: {
                                    adapterCode: 'vendureQuery',
                                    entity: 'Product',
                                },
                            },
                            {
                                key: 'transform',
                                type: StepType.TRANSFORM,
                                config: {
                                    operators: [
                                        { op: 'map', args: { mapping: { productName: '$.name', currency: '"USD"' } } },
                                    ],
                                },
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
            const { startDataHubPipelineRun } = await adminClient.query(gql`
                mutation RunPipeline($id: ID!) {
                    startDataHubPipelineRun(pipelineId: $id) {
                        id
                        status
                    }
                }
            `, { id: pipelineId });

            expect(startDataHubPipelineRun).toMatchObject({
                id: expect.any(String),
                status: expect.any(String),
            });
        });
    });

    describe('Error Handling', () => {
        it('handles invalid pipeline ID', async () => {
            await expect(
                adminClient.query(gql`
                    mutation RunPipeline($id: ID!) {
                        startDataHubPipelineRun(pipelineId: $id) {
                            id
                            status
                        }
                    }
                `, { id: 'non-existent-id' })
            ).rejects.toThrow();
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

            // Running a disabled pipeline should throw an error
            let error: Error | undefined;
            try {
                await adminClient.query(gql`
                    mutation RunPipeline($id: ID!) {
                        startDataHubPipelineRun(pipelineId: $id) {
                            id
                            status
                        }
                    }
                `, { id: createDataHubPipeline.id });
            } catch (e) {
                error = e instanceof Error ? e : new Error(String(e));
            }

            // Cleanup
            await adminClient.query(gql`
                mutation DeletePipeline($id: ID!) {
                    deleteDataHubPipeline(id: $id) { result }
                }
            `, { id: createDataHubPipeline.id });

            expect(error).toBeDefined();
            expect(error?.message).toContain('disabled');
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
                            type: StepType.EXTRACT,
                            config: {
                                adapterCode: 'vendureQuery',
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

        it('previews pipeline output with sandbox', async () => {
            const { dataHubSandbox } = await adminClient.query(gql`
                query Preview($id: ID!) {
                    dataHubSandbox(pipelineId: $id) {
                        status
                        totalDurationMs
                    }
                }
            `, { id: pipelineId });

            expect(dataHubSandbox).toMatchObject({
                status: expect.any(String),
                totalDurationMs: expect.any(Number),
            });
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
                            type: StepType.EXTRACT,
                            config: {
                                adapterCode: 'vendureQuery',
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

        it('cancels running pipeline', async () => {
            const { startDataHubPipelineRun } = await adminClient.query(gql`
                mutation RunPipeline($id: ID!) {
                    startDataHubPipelineRun(pipelineId: $id) {
                        id
                        status
                    }
                }
            `, { id: pipelineId });

            const { cancelDataHubPipelineRun } = await adminClient.query(gql`
                mutation CancelRun($id: ID!) {
                    cancelDataHubPipelineRun(id: $id) {
                        id
                        status
                    }
                }
            `, { id: startDataHubPipelineRun.id });

            expect(cancelDataHubPipelineRun).toMatchObject({
                id: expect.any(String),
                status: expect.any(String),
            });
        });
    });

    describe('Analytics', () => {
        it('queries analytics overview', async () => {
            const { dataHubAnalyticsOverview } = await adminClient.query(gql`
                query {
                    dataHubAnalyticsOverview {
                        totalPipelines
                        activePipelines
                        runsToday
                    }
                }
            `);

            expect(dataHubAnalyticsOverview.totalPipelines).toBeGreaterThanOrEqual(0);
        });

        it('queries real-time stats', async () => {
            const { dataHubRealTimeStats } = await adminClient.query(gql`
                query {
                    dataHubRealTimeStats {
                        activeRuns
                        queuedRuns
                        recentErrors
                    }
                }
            `);

            expect(dataHubRealTimeStats).toMatchObject({
                activeRuns: expect.any(Number),
                queuedRuns: expect.any(Number),
                recentErrors: expect.any(Number),
            });
        });
    });

    describe('Run Errors', () => {
        it('queries run errors', async () => {
            // First get a run to query errors for
            const { dataHubPipelineRuns } = await adminClient.query(gql`
                query {
                    dataHubPipelineRuns {
                        items { id }
                    }
                }
            `);

            // Ensure we have runs to query errors for
            expect(dataHubPipelineRuns.items.length).toBeGreaterThan(0);

            const runId = dataHubPipelineRuns.items[0].id;
            const { dataHubRunErrors } = await adminClient.query(gql`
                query RunErrors($runId: ID!) {
                    dataHubRunErrors(runId: $runId) {
                        id
                        message
                        stepKey
                    }
                }
            `, { runId });

            expect(dataHubRunErrors).toBeDefined();
            expect(Array.isArray(dataHubRunErrors)).toBe(true);
        });

        it('queries error analytics', async () => {
            const { dataHubErrorAnalytics } = await adminClient.query(gql`
                query {
                    dataHubErrorAnalytics {
                        totalErrors
                        errorsByStep {
                            stepKey
                            count
                        }
                    }
                }
            `);

            expect(dataHubErrorAnalytics).toMatchObject({
                totalErrors: expect.any(Number),
                errorsByStep: expect.any(Array),
            });
        });
    });
});

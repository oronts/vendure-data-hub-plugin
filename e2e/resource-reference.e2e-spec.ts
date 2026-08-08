import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TransactionalConnection } from '@vendure/core';
import gql from 'graphql-tag';
import {
    ConfigurationSource,
    ConnectionType,
    PipelineStatus,
    RunStatus,
    StepType,
} from '../src/constants/enums';
import { Pipeline, PipelineRun } from '../src/entities/pipeline';
import { createDataHubTestEnvironment } from './test-config';

describe('nonterminal run resource references', () => {
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

    it('protects a connection until its pinned run snapshot is terminal', async () => {
        const { createDataHubConnection } = await adminClient.query(gql`
            mutation CreatePinnedRunConnection($input: CreateDataHubConnectionInput!) {
                createDataHubConnection(input: $input) { id }
            }
        `, {
            input: {
                code: 'pinned-run-http',
                type: ConnectionType.HTTP,
                config: { baseUrl: 'https://api.example.com' },
            },
        });
        const definition = {
            version: 1,
            steps: [{
                key: 'extract',
                type: StepType.EXTRACT,
                config: {
                    adapterCode: 'httpApi',
                    connectionCode: 'pinned-run-http',
                },
            }],
            edges: [],
        };
        const connection = server.app.get(TransactionalConnection);
        const pipeline = await connection.rawConnection.getRepository(Pipeline).save(
            Object.assign(new Pipeline(), {
                code: 'pinned-run-resource-test',
                name: 'Pinned Run Resource Test',
                enabled: false,
                configurationSource: ConfigurationSource.DATABASE,
                version: 1,
                definition,
                status: PipelineStatus.DRAFT,
                publishedAt: null,
                publishedByUserId: null,
                currentRevisionId: null,
                draftRevisionId: null,
                publishedVersionCount: 0,
            }),
        );
        const run = await connection.rawConnection.getRepository(PipelineRun).save(
            Object.assign(new PipelineRun(), {
                pipeline,
                pipelineId: pipeline.id,
                revisionId: null,
                status: RunStatus.PAUSED,
                definitionSnapshot: definition,
            }),
        );

        const blocked = await adminClient.query(gql`
            mutation DeletePinnedRunConnection($id: ID!) {
                deleteDataHubConnection(id: $id) { result message }
            }
        `, { id: createDataHubConnection.id });
        expect(blocked.deleteDataHubConnection).toMatchObject({
            result: 'NOT_DELETED',
            message: expect.stringContaining(`nonterminal pipeline runs: ${String(run.id)}`),
        });

        run.status = RunStatus.CANCELLED;
        await connection.rawConnection.getRepository(PipelineRun).save(run);

        const deleted = await adminClient.query(gql`
            mutation DeleteReleasedConnection($id: ID!) {
                deleteDataHubConnection(id: $id) { result message }
            }
        `, { id: createDataHubConnection.id });
        expect(deleted.deleteDataHubConnection.result).toBe('DELETED');
    });
});

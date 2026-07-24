import { describe, expect, it, vi } from 'vitest';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    DataHubConnection,
    DataHubExportDestination,
    DataHubSecret,
} from '../../entities/config';
import { Pipeline, PipelineRevision, PipelineRun } from '../../entities/pipeline';
import { RunStatus } from '../../constants/enums';
import {
    collectResourceReferences,
    ResourceReferenceService,
} from './resource-reference.service';

interface FixtureData {
    readonly pipelines?: readonly object[];
    readonly revisions?: readonly object[];
    readonly runs?: readonly object[];
    readonly connections?: readonly object[];
    readonly destinations?: readonly object[];
    readonly secrets?: readonly object[];
    readonly configSecretCodes?: readonly string[];
}

function createService(data: FixtureData = {}): ResourceReferenceService {
    const repositories = new Map<unknown, unknown>([
        [Pipeline, { find: vi.fn(async () => data.pipelines ?? []) }],
        [PipelineRevision, { find: vi.fn(async () => data.revisions ?? []) }],
        [PipelineRun, { find: vi.fn(async () => data.runs ?? []) }],
        [DataHubConnection, { find: vi.fn(async () => data.connections ?? []) }],
        [DataHubExportDestination, { find: vi.fn(async () => data.destinations ?? []) }],
        [DataHubSecret, { find: vi.fn(async () => data.secrets ?? []) }],
    ]);
    const connection = {
        getRepository: vi.fn((_ctx: RequestContext, entity: unknown) => repositories.get(entity)),
    } as unknown as TransactionalConnection;
    const secretService = {
        isConfigSecret: vi.fn((code: string) => data.configSecretCodes?.includes(code) ?? false),
        exists: vi.fn(async (_ctx: RequestContext, code: string) => (
            data.configSecretCodes?.includes(code)
            || data.secrets?.some(secret => Reflect.get(secret, 'code') === code)
            || false
        )),
    };
    return new ResourceReferenceService(connection, secretService as never);
}

describe('resource reference collection', () => {
    it('collects nested, custom, and mapped resource fields without treating ordinary codes as references', () => {
        const value: Record<string, unknown> = {
            code: 'not-a-reference',
            connectionCode: 'primary-api',
            warehouseConnectionCode: 'warehouse-db',
            oauth2ConnectionCode: 'oauth-api',
            source_1ConnectionCode: 'versioned-source',
            auth: {
                secretCode: 'bearer-token',
                usernameSecretCode: 'api-user',
                v2SecretCode: 'versioned-token',
                source_1SecretCode: 'underscored-token',
                headerSecretCodes: {
                    Authorization: 'header-token',
                    'X-Signatures': ['first-signature', 'second-signature'],
                },
            },
        };
        value.self = value;

        const references = collectResourceReferences(value);

        expect([...references.connections].sort()).toEqual([
            'oauth-api',
            'primary-api',
            'versioned-source',
            'warehouse-db',
        ]);
        expect([...references.secrets].sort()).toEqual([
            'api-user',
            'bearer-token',
            'first-signature',
            'header-token',
            'second-signature',
            'underscored-token',
            'versioned-token',
        ]);
    });
});

describe('ResourceReferenceService', () => {
    const ctx = {} as RequestContext;
    const publishedDefinition = {
        version: 1,
        steps: [{
            key: 'extract',
            type: 'EXTRACT',
            config: {
                connectionCode: 'primary-api',
                bearerTokenSecretCode: 'pipeline-token',
            },
        }],
    };

    it('blocks connection changes using the active published revision', async () => {
        const service = createService({
            pipelines: [{ code: 'catalog-sync', currentRevisionId: 7 }],
            revisions: [{ id: 7, definition: publishedDefinition }],
        });

        await expect(service.assertConnectionMutable(ctx, 'primary-api'))
            .rejects.toThrow(/published pipelines: catalog-sync/);
        await expect(service.assertConnectionMutable(ctx, 'unused'))
            .resolves.toBeUndefined();
    });

    it('blocks connection changes while a pinned run snapshot still references it', async () => {
        const service = createService({
            runs: [{
                id: 91,
                status: RunStatus.PAUSED,
                definitionSnapshot: publishedDefinition,
            }],
        });

        await expect(service.assertConnectionMutable(ctx, 'primary-api'))
            .rejects.toThrow(/nonterminal pipeline runs: 91/);
    });

    it('reports direct and transitive secret references', async () => {
        const service = createService({
            pipelines: [{ code: 'catalog-sync', currentRevisionId: 7 }],
            revisions: [{ id: 7, definition: publishedDefinition }],
            connections: [{
                code: 'primary-api',
                config: { auth: { secretCode: 'pipeline-token' } },
            }],
            destinations: [{
                destinationId: 'warehouse-export',
                config: { headerSecretCodes: { Authorization: 'pipeline-token' } },
            }],
        });

        await expect(service.assertSecretMutable(ctx, 'pipeline-token'))
            .rejects.toThrow(
                /published pipelines: catalog-sync; connections: primary-api; destinations: warehouse-export/,
            );
    });

    it('blocks secret changes while a pinned run snapshot still references it', async () => {
        const service = createService({
            runs: [{
                id: 'run-42',
                status: RunStatus.CANCEL_REQUESTED,
                definitionSnapshot: publishedDefinition,
            }],
        });

        await expect(service.assertSecretMutable(ctx, 'pipeline-token'))
            .rejects.toThrow(/nonterminal pipeline runs: run-42/);
    });

    it('blocks active-channel secret removal while a destination consumes it', async () => {
        const service = createService({
            destinations: [{
                destinationId: 'warehouse-export',
                config: { secretCode: 'pipeline-token' },
            }],
        });

        await expect(service.assertSecretUnassignable(ctx, 'pipeline-token'))
            .rejects.toThrow('still used in the active channel');
    });

    it('fails closed when a nonterminal run has no definition snapshot', async () => {
        const service = createService({
            runs: [{
                id: 93,
                status: RunStatus.RUNNING,
                definitionSnapshot: null,
            }],
        });

        await expect(service.assertConnectionMutable(ctx, 'unused'))
            .rejects.toThrow(
                'Definition snapshot is unavailable for nonterminal pipeline run "93"',
            );
    });

    it('fails closed when an active published revision is missing', async () => {
        const service = createService({
            pipelines: [{ code: 'catalog-sync', currentRevisionId: 7 }],
            revisions: [],
        });

        await expect(service.assertConnectionMutable(ctx, 'primary-api'))
            .rejects.toThrow(
                'Published revision 7 is unavailable for pipeline "catalog-sync"',
            );
    });

    it('reports missing direct and connection-transitive resources', async () => {
        const service = createService({
            connections: [{
                code: 'primary-api',
                config: {
                    auth: { secretCode: 'connection-token' },
                },
            }],
            secrets: [{ code: 'pipeline-token' }],
        });

        const missing = await service.findMissingDefinitionReferences(ctx, {
            ...publishedDefinition,
            steps: [
                ...publishedDefinition.steps,
                {
                    key: 'sink',
                    type: 'SINK',
                    config: {
                        connectionCode: 'missing-connection',
                        apiKeySecretCode: 'missing-token',
                    },
                },
            ],
        } as never);

        expect(missing).toEqual({
            connections: ['missing-connection'],
            secrets: ['connection-token', 'missing-token'],
        });
    });

    it('accepts code-first secrets during publication validation', async () => {
        const service = createService({
            connections: [{ code: 'primary-api', config: {} }],
            secrets: [],
            configSecretCodes: ['pipeline-token'],
        });

        await expect(service.findMissingDefinitionReferences(
            ctx,
            publishedDefinition as never,
        )).resolves.toEqual({ connections: [], secrets: [] });
    });
});

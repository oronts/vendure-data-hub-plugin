import { describe, expect, it, vi } from 'vitest';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PipelineStatus } from '../../constants/enums';
import { PipelineRevision } from '../../entities/pipeline';
import type { PipelineDefinition } from '../../types';
import { HookScriptRegistryService } from '../events/hook-script-registry.service';
import { DefinitionValidationService, ValidationLevel } from './definition-validation.service';

function createService(
    targets: readonly object[] = [],
    revisions: readonly object[] = [],
) {
    const pipelineRepository = {
        find: vi.fn(async () => targets),
    };
    const revisionRepository = {
        find: vi.fn(async () => revisions),
    };
    const connection = {
        getRepository: vi.fn((_ctx: RequestContext, entity: unknown) => (
            entity === PipelineRevision ? revisionRepository : pipelineRepository
        )),
        rawConnection: {
            getRepository: vi.fn((entity: unknown) => (
                entity === PipelineRevision ? revisionRepository : pipelineRepository
            )),
        },
    };
    const scripts = new HookScriptRegistryService();
    const resourceReferences = {
        findMissingDefinitionReferences: vi.fn(async () => ({
            connections: [],
            secrets: [],
        })),
    };
    const logger = { warn: vi.fn() };
    const service = new DefinitionValidationService(
        { find: vi.fn(), list: vi.fn(() => []) } as never,
        connection as unknown as TransactionalConnection,
        resourceReferences as never,
        scripts,
        { createLogger: vi.fn(() => logger) } as never,
    );
    return { service, scripts, pipelineRepository, revisionRepository, logger };
}

const targetDefinition: PipelineDefinition = {
    version: 1,
    steps: [
        { key: 'hook', type: 'TRIGGER', config: { type: 'MANUAL' } },
        { key: 'load', type: 'LOAD', config: { adapterCode: 'productUpsert' } },
    ],
    edges: [{ from: 'hook', to: 'load' }],
};

function hookDefinition(
    pipelineCode = 'catalog-follow-up',
    scriptName = 'normalize-prices',
): PipelineDefinition {
    return {
        version: 1,
        steps: [],
        hooks: {
            PIPELINE_COMPLETED: [{
                type: 'TRIGGER_PIPELINE',
                pipelineCode,
                triggerKey: 'hook',
            }],
            AFTER_EXTRACT: [{
                type: 'SCRIPT',
                scriptName,
            }],
        },
    };
}

describe('DefinitionValidationService hook references', () => {
    const ctx = {} as RequestContext;

    it('accepts registered scripts and enabled published pipeline targets', async () => {
        const fixture = createService([{
            id: 2,
            code: 'catalog-follow-up',
            currentRevisionId: 7,
            enabled: true,
            status: PipelineStatus.PUBLISHED,
        }], [{ id: 7, definition: targetDefinition }]);
        fixture.scripts.register('normalize-prices', vi.fn());

        const result = await fixture.service.validateAsync(
            hookDefinition(),
            { level: ValidationLevel.FULL },
            ctx,
        );

        expect(result.issues).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    it('rejects missing scripts and unknown pipeline targets', async () => {
        const fixture = createService();

        const result = await fixture.service.validateAsync(
            hookDefinition(),
            { level: ValidationLevel.FULL },
            ctx,
        );

        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ errorCode: 'hook-script-unknown' }),
            expect.objectContaining({ errorCode: 'hook-pipeline-unknown' }),
        ]));
    });

    it('rejects pipeline targets that cannot run', async () => {
        const fixture = createService([{
            code: 'catalog-follow-up',
            currentRevisionId: null,
            enabled: false,
            status: PipelineStatus.DRAFT,
        }]);
        fixture.scripts.register('normalize-prices', vi.fn());

        const result = await fixture.service.validateAsync(
            hookDefinition(),
            { level: ValidationLevel.FULL },
            ctx,
        );

        expect(result.issues).toContainEqual(expect.objectContaining({
            errorCode: 'hook-pipeline-not-runnable',
        }));
    });

    it('rejects a target whose active revision does not contain the requested trigger route', async () => {
        const fixture = createService([{
            id: 2,
            code: 'catalog-follow-up',
            currentRevisionId: 7,
            enabled: true,
            status: PipelineStatus.PUBLISHED,
        }], [{
            id: 7,
            definition: {
                ...targetDefinition,
                steps: targetDefinition.steps.filter(step => step.key !== 'hook'),
            },
        }]);
        fixture.scripts.register('normalize-prices', vi.fn());

        const result = await fixture.service.validateAsync(
            hookDefinition(),
            { level: ValidationLevel.FULL },
            ctx,
        );

        expect(result.issues).toContainEqual(expect.objectContaining({
            errorCode: 'hook-trigger-not-runnable',
        }));
    });

    it('reports an unverifiable target lookup as a blocking warning', async () => {
        const fixture = createService();
        fixture.scripts.register('normalize-prices', vi.fn());
        fixture.pipelineRepository.find.mockRejectedValueOnce(new Error('database unavailable'));

        const result = await fixture.service.validateAsync(
            hookDefinition(),
            { level: ValidationLevel.FULL },
            ctx,
        );

        expect(result.warnings).toContainEqual(expect.objectContaining({
            errorCode: 'hook-reference-check-failed',
        }));
    });
});

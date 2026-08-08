import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { AdapterType, PIPELINE_VALIDATION_ERROR, StepType } from '../../constants/enums';
import type { PipelineDefinition } from '../../types';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { HookScriptRegistryService } from '../events/hook-script-registry.service';
import { DefinitionValidationService } from './definition-validation.service';

const SCHEMA_REFERENCE = {
    schemaId: 'catalog.product',
    version: '1.0.0',
};

function createFixture(schemaFound: boolean) {
    const registry = new DataHubRegistryService();
    registry.register({
        type: AdapterType.EXTRACTOR,
        code: 'current-source',
        name: 'Current source',
        schema: { fields: [] },
    });
    const schemaRegistry = {
        getByReferences: vi.fn(async () => schemaFound
            ? new Map([['catalog.product\u00001.0.0', {}]])
            : new Map()),
    };
    const service = new DefinitionValidationService(
        registry,
        {} as TransactionalConnection,
        { findMissingDefinitionReferences: vi.fn() } as never,
        new HookScriptRegistryService(),
        { createLogger: vi.fn(() => ({ warn: vi.fn() })) } as never,
        schemaRegistry as never,
    );
    const definition: PipelineDefinition = {
        version: 1,
        steps: [{
            key: 'extract',
            type: StepType.EXTRACT,
            config: { adapterCode: 'current-source' },
            schemaRef: SCHEMA_REFERENCE,
        }],
    };
    return { definition, schemaRegistry, service };
}

describe('DefinitionValidationService schema references', () => {
    it('accepts an exact registered schema version', async () => {
        const fixture = createFixture(true);

        const result = await fixture.service.validateAsync(
            fixture.definition,
            { skipDependencyCheck: true },
            {} as RequestContext,
        );

        expect(result.issues).toEqual([]);
        expect(fixture.schemaRegistry.getByReferences).toHaveBeenCalledWith(
            expect.anything(),
            [SCHEMA_REFERENCE],
        );
    });

    it('rejects an unknown schema version even when dependency checks are skipped', async () => {
        const fixture = createFixture(false);

        const result = await fixture.service.validateAsync(
            fixture.definition,
            { skipDependencyCheck: true },
            {} as RequestContext,
        );

        expect(result.issues).toContainEqual(expect.objectContaining({
            errorCode: PIPELINE_VALIDATION_ERROR.SCHEMA_REFERENCE_NOT_FOUND,
            stepKey: 'extract',
            field: 'schemaRef',
        }));
    });
});

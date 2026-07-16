import { describe, expect, it, vi } from 'vitest';
import type { Permission } from '@vendure/core';
import { AdapterType, StepType } from '../../constants/enums';
import type { AdapterDefinition } from '../../sdk/types';
import type { PipelineDefinition } from '../../types';
import {
    AdapterDefinitionRegistry,
    getMissingPipelinePermissions,
    getRequiredPipelinePermissions,
    PermissionContext,
    withEffectivePipelineCapabilities,
} from './pipeline-capabilities';

const definitions = new Map<string, AdapterDefinition>([
    [`${AdapterType.LOADER}:productUpsert`, {
        type: AdapterType.LOADER,
        code: 'productUpsert',
        schema: { fields: [] },
        requires: ['UpdateCatalog'],
    }],
    [`${AdapterType.OPERATOR}:translate`, {
        type: AdapterType.OPERATOR,
        code: 'translate',
        schema: { fields: [] },
        requires: ['UpdateSettings'],
    }],
]);

const registry: AdapterDefinitionRegistry = {
    find: (type, code) => definitions.get(`${type}:${code}`),
};

const loaderDefinition: PipelineDefinition = {
    version: 1,
    capabilities: {
        requires: ['RunDataHubPipeline'],
    },
    steps: [{
        key: 'load-products',
        type: StepType.LOAD,
        config: {
            adapterCode: 'productUpsert',
        },
    }],
};

describe('pipeline capabilities', () => {
    it('combines declared and adapter-required permissions', () => {
        expect(getRequiredPipelinePermissions(registry, loaderDefinition)).toEqual([
            'RunDataHubPipeline',
            'UpdateCatalog',
        ]);
    });

    it('includes nested transform operator permissions', () => {
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{
                key: 'translate',
                type: StepType.TRANSFORM,
                config: { operators: [{ op: 'translate' }] },
            }],
        };

        expect(getRequiredPipelinePermissions(registry, definition)).toEqual(['UpdateSettings']);
    });

    it('writes effective permissions without mutating the definition', () => {
        const result = withEffectivePipelineCapabilities(registry, loaderDefinition);

        expect(result).not.toBe(loaderDefinition);
        expect(result.capabilities?.requires).toEqual([
            'RunDataHubPipeline',
            'UpdateCatalog',
        ]);
        expect(loaderDefinition.capabilities?.requires).toEqual(['RunDataHubPipeline']);
    });

    it('requires every permission on the active channel', () => {
        const userHasPermissions = vi.fn((permissions: Permission[]) => (
            permissions.includes('RunDataHubPipeline' as Permission)
        ));
        const ctx: PermissionContext = { userHasPermissions };

        expect(getMissingPipelinePermissions(registry, ctx, loaderDefinition))
            .toEqual(['UpdateCatalog']);
    });

    it('allows super administrators', () => {
        const ctx: PermissionContext = {
            userHasPermissions: permissions => permissions.includes('SuperAdmin' as Permission),
        };

        expect(getMissingPipelinePermissions(registry, ctx, loaderDefinition)).toEqual([]);
    });
});

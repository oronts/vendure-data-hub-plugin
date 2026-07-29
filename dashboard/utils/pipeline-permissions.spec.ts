import { describe, expect, it } from 'vitest';
import type { PipelineDefinition } from '../types';
import {
    getPipelineExecutionPermissions,
    getPipelineWorkflowPermission,
} from './pipeline-permissions';

describe('getPipelineExecutionPermissions', () => {
    it('combines the run permission with declared dynamic capabilities', () => {
        const definition: PipelineDefinition = {
            version: 1,
            steps: [],
            capabilities: {
                requires: ['UpdateCatalog', 'RunDataHubPipeline', 'UpdateCatalog'],
            },
        };

        expect(getPipelineExecutionPermissions(definition, 'RunDataHubPipeline')).toEqual([
            'RunDataHubPipeline',
            'UpdateCatalog',
        ]);
    });

    it('requires pipeline execution when no capabilities are declared', () => {
        expect(getPipelineExecutionPermissions(undefined, 'RunDataHubPipeline')).toEqual([
            'RunDataHubPipeline',
        ]);
    });

    it('derives resource-use permissions from unpublished definitions', () => {
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{
                key: 'remote-source',
                type: 'EXTRACT',
                config: {
                    connectionCode: 'erp',
                    auth: { secretCode: 'api-token' },
                },
            }],
        };

        expect(getPipelineExecutionPermissions(definition, 'RunDataHubPipeline')).toEqual([
            'RunDataHubPipeline',
            'UseDataHubConnection',
            'UseDataHubSecret',
        ]);
    });

    it('maps workflow states to their exact backend action permissions', () => {
        const permissions = {
            update: 'UpdateDataHubPipeline',
            review: 'ReviewDataHubPipeline',
            publish: 'PublishDataHubPipeline',
        };

        expect(getPipelineWorkflowPermission('DRAFT', permissions)).toBe('UpdateDataHubPipeline');
        expect(getPipelineWorkflowPermission('REVIEW', permissions)).toBe('ReviewDataHubPipeline');
        expect(getPipelineWorkflowPermission('PUBLISHED', permissions)).toBe('PublishDataHubPipeline');
        expect(getPipelineWorkflowPermission('ARCHIVED', permissions)).toBeUndefined();
    });
});

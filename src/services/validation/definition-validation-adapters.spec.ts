import { describe, expect, it, vi } from 'vitest';
import type { TransactionalConnection } from '@vendure/core';
import { AdapterType, StepType } from '../../constants/enums';
import type { JsonObject, PipelineDefinition } from '../../types';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { HookScriptRegistryService } from '../events/hook-script-registry.service';
import { DefinitionValidationService } from './definition-validation.service';
import { MULTI_JOIN_OPERATOR_DEFINITION } from '../../operators/aggregation/join.operator';

function createService(registry: DataHubRegistryService): DefinitionValidationService {
    return new DefinitionValidationService(
        registry,
        {} as TransactionalConnection,
        { findMissingDefinitionReferences: vi.fn() } as never,
        new HookScriptRegistryService(),
        { createLogger: vi.fn(() => ({ warn: vi.fn() })) } as never,
    );
}

function deprecatedAdapter(type: AdapterType, code: string) {
    return {
        type,
        code,
        name: code,
        schema: { fields: [] },
        deprecated: true,
        deprecatedMessage: `Use ${code}-v2.`,
    } as const;
}

describe('DefinitionValidationService adapter lifecycle warnings', () => {
    it('warns without blocking a step that uses a deprecated adapter', () => {
        const registry = new DataHubRegistryService();
        registry.register(deprecatedAdapter(AdapterType.EXTRACTOR, 'old-source'));
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{
                key: 'extract',
                type: StepType.EXTRACT,
                config: { adapterCode: 'old-source' },
            }],
        };

        const result = createService(registry).validateSync(definition);

        expect(result.issues).toEqual([]);
        expect(result.warnings).toContainEqual(expect.objectContaining({
            errorCode: 'deprecated-adapter',
            stepKey: 'extract',
            message: expect.stringContaining('Use old-source-v2.'),
        }));
    });

    it('warns for deprecated operators inside transform chains', () => {
        const registry = new DataHubRegistryService();
        registry.register({
            type: AdapterType.EXTRACTOR,
            code: 'current-source',
            name: 'Current source',
            schema: { fields: [] },
        });
        registry.register(deprecatedAdapter(AdapterType.OPERATOR, 'old-transform'));
        const definition: PipelineDefinition = {
            version: 1,
            steps: [
                {
                    key: 'extract',
                    type: StepType.EXTRACT,
                    config: { adapterCode: 'current-source' },
                },
                {
                    key: 'transform',
                    type: StepType.TRANSFORM,
                    config: { operators: [{ op: 'old-transform', args: {} }] },
                },
            ],
            edges: [{ from: 'extract', to: 'transform' }],
        };

        const result = createService(registry).validateSync(definition);

        expect(result.issues).toEqual([]);
        expect(result.warnings).toContainEqual(expect.objectContaining({
            errorCode: 'deprecated-adapter',
            stepKey: 'transform',
            message: expect.stringContaining('operator "old-transform"'),
        }));
    });

    it('uses the root adapter code when root and config values conflict', () => {
        const registry = new DataHubRegistryService();
        registry.register(deprecatedAdapter(AdapterType.EXTRACTOR, 'old-source'));
        registry.register({
            type: AdapterType.EXTRACTOR,
            code: 'current-source',
            name: 'Current source',
            schema: { fields: [] },
        });
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{
                key: 'extract',
                type: StepType.EXTRACT,
                adapterCode: 'old-source',
                config: { adapterCode: 'current-source' },
            }],
        };

        const result = createService(registry).validateSync(definition);

        expect(result.issues).toEqual([]);
        expect(result.warnings).toContainEqual(expect.objectContaining({
            errorCode: 'deprecated-adapter',
            message: expect.stringContaining('"old-source"'),
        }));
        expect(result.warnings.some(warning => warning.message.includes('"current-source"')))
            .toBe(false);
    });

    it('warns for a deprecated single-operator transform', () => {
        const registry = new DataHubRegistryService();
        registry.register({
            type: AdapterType.EXTRACTOR,
            code: 'current-source',
            name: 'Current source',
            schema: { fields: [] },
        });
        registry.register(deprecatedAdapter(AdapterType.OPERATOR, 'old-transform'));
        const definition: PipelineDefinition = {
            version: 1,
            steps: [
                {
                    key: 'extract',
                    type: StepType.EXTRACT,
                    config: { adapterCode: 'current-source' },
                },
                {
                    key: 'transform',
                    type: StepType.TRANSFORM,
                    adapterCode: 'old-transform',
                    config: {},
                },
            ],
            edges: [{ from: 'extract', to: 'transform' }],
        };

        const result = createService(registry).validateSync(definition);

        expect(result.issues).toEqual([]);
        expect(result.warnings).toContainEqual(expect.objectContaining({
            errorCode: 'deprecated-adapter',
            message: expect.stringContaining('operator "old-transform"'),
        }));
    });
});

describe('DefinitionValidationService operator arguments', () => {
    function createRegistry(): DataHubRegistryService {
        const registry = new DataHubRegistryService();
        registry.register({
            type: AdapterType.EXTRACTOR,
            code: 'current-source',
            name: 'Current source',
            schema: { fields: [] },
        });
        registry.register(MULTI_JOIN_OPERATOR_DEFINITION);
        return registry;
    }

    function definitionWithArgs(args: JsonObject): PipelineDefinition {
        return {
            version: 1,
            steps: [
                {
                    key: 'extract',
                    type: StepType.EXTRACT,
                    config: { adapterCode: 'current-source' },
                },
                {
                    key: 'transform',
                    type: StepType.TRANSFORM,
                    config: { operators: [{ op: 'multiJoin', args }] },
                },
            ],
            edges: [{ from: 'extract', to: 'transform' }],
        };
    }

    it('validates transform arguments against the registered operator schema', () => {
        const result = createService(createRegistry()).validateSync(definitionWithArgs({
            leftKey: 'id',
            rightData: [{ id: 'right' }],
            type: 'SIDEWAYS',
            maxOutputRecords: 100_001,
        }));

        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                field: 'rightKey',
                errorCode: 'missing-required-field',
            }),
            expect.objectContaining({
                field: 'type',
                errorCode: 'invalid-select-option',
            }),
            expect.objectContaining({
                field: 'maxOutputRecords',
                errorCode: 'field-above-maximum',
            }),
        ]));
    });

    it('accepts a valid multi-join definition with the default join type', () => {
        const result = createService(createRegistry()).validateSync(definitionWithArgs({
            leftKey: 'id',
            rightKey: 'productId',
            rightData: [{ productId: 'product-1' }],
        }));

        expect(result.issues).toEqual([]);
    });
});

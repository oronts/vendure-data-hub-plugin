import { describe, expect, it } from 'vitest';
import type { PipelineDefinition } from '../../shared/types';
import { AdapterType, StepType } from '../constants/enums';
import { DataHubRegistryService } from './registry.service';
import {
    validateAdapterBindings,
    withResolvedAdapterBindings,
} from './adapter-bindings';

function createRegistry(version = '1.0.0'): DataHubRegistryService {
    const registry = new DataHubRegistryService();
    for (const [type, code] of [
        [AdapterType.EXTRACTOR, 'source'],
        [AdapterType.OPERATOR, 'trim'],
        [AdapterType.OPERATOR, 'rename'],
        [AdapterType.LOADER, 'target'],
    ] as const) {
        registry.register({ type, code, version, apiVersion: 1, schema: { fields: [] } });
    }
    return registry;
}

const definition: PipelineDefinition = {
    version: 1,
    steps: [
        {
            key: 'extract',
            type: StepType.EXTRACT,
            config: { adapterCode: 'source' },
        },
        {
            key: 'transform',
            type: StepType.TRANSFORM,
            config: { operators: [{ op: 'trim' }, { op: 'rename' }] },
        },
        {
            key: 'load',
            type: StepType.LOAD,
            adapterCode: 'target',
            config: {},
        },
    ],
};

describe('published adapter bindings', () => {
    it('resolves every executable adapter location to an exact contract', () => {
        const registry = createRegistry();
        const bound = withResolvedAdapterBindings(registry, definition);

        expect(bound.adapterBindings).toEqual([
            { location: 'steps.extract', type: 'EXTRACTOR', code: 'source', version: '1.0.0', apiVersion: 1 },
            { location: 'steps.transform.operators.0', type: 'OPERATOR', code: 'trim', version: '1.0.0', apiVersion: 1 },
            { location: 'steps.transform.operators.1', type: 'OPERATOR', code: 'rename', version: '1.0.0', apiVersion: 1 },
            { location: 'steps.load', type: 'LOADER', code: 'target', version: '1.0.0', apiVersion: 1 },
        ]);
        expect(validateAdapterBindings(registry, bound, true)).toEqual([]);
    });

    it('fails closed when a published revision has no bindings', () => {
        expect(validateAdapterBindings(createRegistry(), definition, true))
            .toContainEqual(expect.objectContaining({
                errorCode: 'missing-adapter-bindings',
            }));
    });

    it('rejects execution after an installed adapter version changes', () => {
        const bound = withResolvedAdapterBindings(createRegistry(), definition);

        expect(validateAdapterBindings(createRegistry('2.0.0'), bound, true))
            .toContainEqual(expect.objectContaining({
                location: 'steps.extract',
                errorCode: 'adapter-binding-version-mismatch',
            }));
    });
});

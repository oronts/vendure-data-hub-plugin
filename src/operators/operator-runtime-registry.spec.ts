import { describe, expect, it } from 'vitest';
import { DataHubRegistryService } from '../sdk/registry.service';
import { ALL_OPERATOR_DEFINITIONS } from './index';
import {
    getBuiltinOperatorRuntimes,
    OPERATOR_REGISTRY,
} from './operator-runtime-registry';

describe('built-in operator runtime registry', () => {
    it('preserves definition metadata and attaches every runtime', () => {
        const registry = new DataHubRegistryService();
        const runtimes = getBuiltinOperatorRuntimes();

        for (const definition of ALL_OPERATOR_DEFINITIONS) {
            const runtime = runtimes.find(value => value.code === definition.code);
            expect(runtime).toBeDefined();
            for (const [field, value] of Object.entries(definition)) {
                expect(Reflect.get(runtime as object, field)).toEqual(value);
            }
            registry.register(definition, { builtIn: true });
        }

        for (const runtime of runtimes) {
            expect(() => registry.registerRuntime(runtime, { builtIn: true })).not.toThrow();
        }

        expect(runtimes).toHaveLength(Object.keys(OPERATOR_REGISTRY).length);
        expect(runtimes.every(runtime => (
            registry.getRuntime(runtime.type, runtime.code) !== undefined
        ))).toBe(true);
    });
});

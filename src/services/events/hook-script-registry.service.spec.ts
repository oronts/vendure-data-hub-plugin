import { describe, expect, it, vi } from 'vitest';
import { HookScriptRegistryService } from './hook-script-registry.service';

describe('HookScriptRegistryService', () => {
    it('validates names, reports replacement, and returns deterministic names', () => {
        const registry = new HookScriptRegistryService();
        const first = vi.fn();
        const replacement = vi.fn();

        expect(registry.register('normalize-prices', first)).toBe(false);
        expect(registry.register('addMetadata', vi.fn())).toBe(false);
        expect(registry.register('normalize-prices', replacement)).toBe(true);
        expect(registry.get('normalize-prices')).toBe(replacement);
        expect(registry.names()).toEqual(['addMetadata', 'normalize-prices']);
        expect(() => registry.register('../unsafe', vi.fn())).toThrow(/script names/);
    });
});

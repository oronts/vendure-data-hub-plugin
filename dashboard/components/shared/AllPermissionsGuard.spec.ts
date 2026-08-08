import { describe, expect, it, vi } from 'vitest';
import { hasAllPermissions } from '../../utils/permissions';

describe('hasAllPermissions', () => {
    it('requires every permission instead of Vendure PermissionGuard OR semantics', () => {
        const granted = new Set([
            'CreateDataHubPipeline',
            'ReadDataHubPipeline',
        ]);
        const checker = vi.fn((permission: string) => granted.has(permission));

        expect(
            hasAllPermissions(
                ['CreateDataHubPipeline', 'ReadDataHubPipeline'],
                checker,
            ),
        ).toBe(true);
        expect(
            hasAllPermissions(
                ['CreateDataHubPipeline', 'ViewDataHubEntitySchemas'],
                checker,
            ),
        ).toBe(false);
    });

    it('allows an empty requirement set', () => {
        expect(hasAllPermissions([], () => false)).toBe(true);
    });
});

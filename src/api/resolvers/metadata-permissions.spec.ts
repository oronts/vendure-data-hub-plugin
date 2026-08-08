import 'reflect-metadata';
import { Permission } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { DataHubAdapterAdminResolver } from './adapter.resolver';
import { DataHubConfigOptionsAdminResolver } from './config-options.resolver';
import { ManageDataHubAdaptersPermission } from '../../permissions';

vi.mock('../../operators', () => ({ FIELD_TRANSFORM_TYPES: [] }));
vi.mock('../../constants/events', () => ({}));
vi.mock('../../constants/connection-schemas', () => ({}));
vi.mock('../../constants/destination-schemas', () => ({}));
vi.mock('../../constants/hook-stage-metadata', () => ({}));
vi.mock('../../constants/enum-metadata', () => ({}));
vi.mock('../../constants/adapter-schema-options', () => ({}));
vi.mock('../../constants/file-format-metadata', () => ({}));
vi.mock('../../constants/adapters', () => ({}));

const PERMISSIONS_METADATA_KEY = '__permissions__';

function getAllowedPermissions(method: object): string[] {
    return Reflect.getMetadata(PERMISSIONS_METADATA_KEY, method) ?? [];
}

describe('Data Hub metadata query permissions', () => {
    it('requires adapter management permission for adapter form metadata', () => {
        expect(getAllowedPermissions(DataHubAdapterAdminResolver.prototype.dataHubAdapters))
            .toEqual([ManageDataHubAdaptersPermission.Permission]);
    });

    it('allows every authenticated administrator to read static configuration options', () => {
        expect(getAllowedPermissions(DataHubConfigOptionsAdminResolver.prototype.dataHubConfigOptions))
            .toEqual([Permission.Authenticated]);
    });
});

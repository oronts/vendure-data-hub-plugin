import { Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { ManageDataHubAdaptersPermission } from '../../permissions';

@Resolver()
export class DataHubAdapterAdminResolver {
    constructor(private registry: DataHubRegistryService) {}

    @Query()
    @Allow(ManageDataHubAdaptersPermission.Permission)
    dataHubAdapters() {
        return this.registry.list();
    }
}

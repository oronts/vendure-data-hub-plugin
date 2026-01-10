import { Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { ManageDataHubAdaptersPermission } from '../../permissions';
import { DataHubRegistryService } from '../../sdk/registry.service';

@Resolver()
export class DataHubAdapterAdminResolver {
    constructor(private registry: DataHubRegistryService) {}

    // ADAPTER QUERIES

    @Query()
    @Allow(ManageDataHubAdaptersPermission.Permission)
    dataHubAdapters() {
        return this.registry.list();
    }
}

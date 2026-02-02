import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { DataHubPipelinePermission } from '../../permissions';
import { DomainEventsService } from '../../services';
import { DEFAULTS } from '../../constants/index';

@Resolver()
export class DataHubEventsAdminResolver {
    constructor(private events: DomainEventsService) {}

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubEvents(@Args() args: { limit?: number }) {
        return this.events.list(args?.limit ?? DEFAULTS.EVENTS_LIMIT);
    }
}

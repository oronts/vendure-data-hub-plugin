import { Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { DataHubPipelinePermission } from '../../permissions';
import { TemplateRegistryService } from '../../services/templates/template-registry.service';

@Resolver()
export class DataHubTemplateAdminResolver {
    constructor(private templateRegistry: TemplateRegistryService) {}

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubImportTemplates() {
        return this.templateRegistry.getImportTemplates();
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubExportTemplates() {
        return this.templateRegistry.getExportTemplates();
    }

    @Query()
    @Allow(DataHubPipelinePermission.Read)
    dataHubImportTemplateCategories() {
        return this.templateRegistry.getImportTemplateCategories();
    }
}

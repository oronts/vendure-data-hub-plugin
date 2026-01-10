import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { ManageDataHubAdaptersPermission } from '../../permissions';
import {
    ExtractorRegistryService,
    ExtractorMetadata,
} from '../../extractors/extractor-registry.service';
import { ExtractorCategory, StepConfigSchema } from '../../types/index';
import type { ExtractorOutput, ExtractorsByCategoryOutput } from '../types/index';

@Resolver()
export class DataHubExtractorAdminResolver {
    constructor(private extractorRegistry: ExtractorRegistryService) {}

    // EXTRACTOR QUERIES

    @Query()
    @Allow(ManageDataHubAdaptersPermission.Permission)
    dataHubExtractors(): ExtractorOutput[] {
        const metadata = this.extractorRegistry.getExtractorMetadata();
        return metadata.map(meta => this.mapExtractorToGql(meta));
    }

    @Query()
    @Allow(ManageDataHubAdaptersPermission.Permission)
    dataHubExtractorsByCategory(): ExtractorsByCategoryOutput[] {
        const byCategory = this.extractorRegistry.getExtractorsByCategory();
        const labels = this.extractorRegistry.getCategoryLabels();

        return Object.entries(byCategory).map(([category, extractors]) => ({
            category: this.normalizeCategoryForGql(category as ExtractorCategory),
            label: labels[category as ExtractorCategory] || category,
            extractors: extractors.map(meta => this.mapExtractorToGql(meta)),
        }));
    }

    @Query()
    @Allow(ManageDataHubAdaptersPermission.Permission)
    dataHubExtractor(@Args() args: { code: string }): ExtractorOutput | null {
        const info = this.extractorRegistry.getExtractorInfo(args.code);
        if (!info) {
            return null;
        }
        return this.mapExtractorToGql(info.metadata);
    }

    @Query()
    @Allow(ManageDataHubAdaptersPermission.Permission)
    dataHubExtractorSchema(@Args() args: { code: string }): ExtractorOutput['schema'] | null {
        const extractor = this.extractorRegistry.getExtractor(args.code);
        if (!extractor) {
            return null;
        }
        return this.mapSchemaToGql(extractor.schema);
    }

    // HELPER METHODS

    /**
     * Map extractor metadata to GraphQL type
     */
    private mapExtractorToGql(meta: ExtractorMetadata): ExtractorOutput {
        const extractor = this.extractorRegistry.getExtractor(meta.code);
        const schema = extractor?.schema ?? { fields: [] };

        return {
            code: meta.code,
            name: meta.name,
            description: meta.description,
            category: this.normalizeCategoryForGql(meta.category),
            version: meta.version,
            icon: meta.icon,
            supportsPagination: meta.supportsPagination ?? false,
            supportsIncremental: meta.supportsIncremental ?? false,
            supportsCancellation: meta.supportsCancellation ?? false,
            isStreaming: meta.isStreaming,
            isBatch: meta.isBatch,
            schema: this.mapSchemaToGql(schema),
        };
    }

    /**
     * Map config schema to GraphQL type
     */
    private mapSchemaToGql(schema: StepConfigSchema): ExtractorOutput['schema'] {
        return {
            fields: schema.fields.map(field => ({
                key: field.key,
                label: field.label,
                description: field.description,
                type: field.type,
                required: field.required,
                defaultValue: field.defaultValue,
                placeholder: field.placeholder,
                options: field.options,
                group: field.group,
                dependsOn: field.dependsOn
                    ? {
                          field: field.dependsOn.field,
                          value: field.dependsOn.value,
                          operator: field.dependsOn.operator,
                      }
                    : undefined,
            })),
            groups: schema.groups?.map(group => ({
                id: group.id,
                label: group.label,
                description: group.description,
            })),
        };
    }

    /**
     * Normalize category name for GraphQL enum compatibility
     * GraphQL enums use underscores, not hyphens
     */
    private normalizeCategoryForGql(category: ExtractorCategory): string {
        return category.replace(/-/g, '_');
    }
}

import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { LoaderRegistryService } from '../../loaders/registry';
import { ViewDataHubEntitySchemasPermission } from '../../permissions';
import { VendureEntityType, EntityFieldSchema, EntityField } from '../../types/index';
import { ENTITY_DESCRIPTIONS } from '../../vendure-schemas/vendure-entity-schemas';
import { screamingSnakeToKebab } from '../../../shared/utils/string-case';

function mapFieldTypeToGraphQL(type: EntityField['type']): string {
    switch (type) {
        case 'localized-string':
            return 'localized_string';
        default:
            return type;
    }
}

function transformField(field: EntityField): Record<string, unknown> {
    return {
        key: field.key,
        label: field.label,
        type: mapFieldTypeToGraphQL(field.type),
        required: field.required ?? false,
        readonly: field.readonly ?? false,
        lookupable: field.lookupable ?? false,
        translatable: field.translatable ?? false,
        relatedEntity: field.relatedEntity ?? null,
        children: field.children?.map(transformField) ?? null,
        description: field.description ?? null,
        example: field.example ?? null,
        validation: field.validation ?? null,
    };
}

function transformSchema(schema: EntityFieldSchema): Record<string, unknown> {
    return {
        entityType: schema.entityType,
        fields: schema.fields.map(transformField),
    };
}

@Resolver()
export class EntitySchemaAdminResolver {
    constructor(private loaderRegistry: LoaderRegistryService) {}

    @Query()
    @Allow(ViewDataHubEntitySchemasPermission.Permission)
    async dataHubLoaderEntitySchema(
        @Args() args: { entityType: string },
    ): Promise<Record<string, unknown> | null> {
        const schema = this.loaderRegistry.getFieldSchema(args.entityType as VendureEntityType);
        if (!schema) {
            return null;
        }
        return transformSchema(schema);
    }

    @Query()
    @Allow(ViewDataHubEntitySchemasPermission.Permission)
    async dataHubLoaderEntitySchemas(): Promise<Record<string, unknown>[]> {
        const schemas = this.loaderRegistry.getAllFieldSchemas();
        return Array.from(schemas.values()).map(transformSchema);
    }

    @Query()
    @Allow(ViewDataHubEntitySchemasPermission.Permission)
    async dataHubSupportedEntities(): Promise<Array<{
        code: string;
        name: string;
        description: string | null;
        supportedOperations: string[];
        adapterCode: string;
    }>> {
        const loaders = this.loaderRegistry.getAll();
        return loaders.map(loader => ({
            code: screamingSnakeToKebab(loader.entityType),
            name: this.formatEntityName(loader.entityType),
            description: this.getEntityDescription(loader.entityType),
            supportedOperations: loader.supportedOperations,
            adapterCode: loader.adapterCode,
        }));
    }

    /** Convert UPPER_CASE to Title Case (e.g., PRODUCT_VARIANT -> Product Variant) */
    private formatEntityName(entityType: string): string {
        return entityType
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    private getEntityDescription(entityType: string): string | null {
        return ENTITY_DESCRIPTIONS[entityType] ?? null;
    }
}

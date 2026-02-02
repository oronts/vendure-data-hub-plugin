import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { LoaderRegistryService } from '../../loaders/registry';
import { ViewDataHubEntitySchemasPermission } from '../../permissions';
import { VendureEntityType, EntityFieldSchema, EntityField } from '../../types/index';

const ENTITY_DESCRIPTIONS: Record<string, string> = {
    Product: 'Products with variants, assets, and custom fields',
    ProductVariant: 'Individual product variants with SKU, pricing, and inventory',
    Customer: 'Customer accounts with addresses and order history',
    CustomerGroup: 'Customer groups for segmentation and pricing',
    Order: 'Customer orders with lines, payments, and fulfillments',
    Collection: 'Product collections for navigation and categorization',
    Facet: 'Facets for product filtering (e.g., Color, Size)',
    FacetValue: 'Individual facet values (e.g., Red, Large)',
    Asset: 'Media assets including images and files',
    Promotion: 'Promotional rules and coupon codes',
    ShippingMethod: 'Shipping method configurations',
    StockLocation: 'Inventory locations and warehouses',
    Inventory: 'Stock levels for product variants',
};

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
    }>> {
        const loaders = this.loaderRegistry.getAll();
        return loaders.map(loader => ({
            code: loader.entityType,
            name: this.formatEntityName(loader.entityType),
            description: this.getEntityDescription(loader.entityType),
            supportedOperations: loader.supportedOperations,
        }));
    }

    private formatEntityName(entityType: string): string {
        return entityType.replace(/([A-Z])/g, ' $1').trim();
    }

    private getEntityDescription(entityType: string): string | null {
        return ENTITY_DESCRIPTIONS[entityType] ?? null;
    }
}

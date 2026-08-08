import { VENDURE_ENTITY_TYPE_OPTIONS } from '../../constants/adapter-schema-options';
import { VendureEntityType } from '../../constants/enums';
import { VENDURE_ENTITY_SCHEMAS } from '../../vendure-schemas/vendure-entity-schemas';
import { screamingSnakeToKebab } from '../../../shared/utils/string-case';

export interface ExportEntityFieldSchema {
    readonly key: string;
    readonly label: string;
    readonly type: string;
    readonly description?: string;
    readonly queryable: boolean;
}

export interface ExportEntitySchema {
    readonly entityType: VendureEntityType;
    readonly name: string;
    readonly description: string;
    readonly fields: readonly ExportEntityFieldSchema[];
}

interface ExportEntityDefinition {
    readonly entityType: VendureEntityType;
    readonly fields: readonly string[];
    readonly queryFields: readonly string[];
}

const BASE_FIELDS = ['id', 'createdAt', 'updatedAt'] as const;
const BASE_QUERY_FIELDS = ['id', 'createdAt', 'updatedAt'] as const;

const EXPORT_ENTITY_DEFINITIONS: readonly ExportEntityDefinition[] = [
    {
        entityType: VendureEntityType.PRODUCT,
        fields: [...BASE_FIELDS, 'deletedAt', 'enabled', 'name', 'slug', 'description', 'customFields'],
        queryFields: [...BASE_QUERY_FIELDS, 'deletedAt', 'enabled'],
    },
    {
        entityType: VendureEntityType.PRODUCT_VARIANT,
        fields: [
            ...BASE_FIELDS,
            'deletedAt',
            'enabled',
            'sku',
            'name',
            'price',
            'listPrice',
            'priceWithTax',
            'currencyCode',
            'outOfStockThreshold',
            'useGlobalOutOfStockThreshold',
            'trackInventory',
            'customFields',
        ],
        queryFields: [
            ...BASE_QUERY_FIELDS,
            'deletedAt',
            'enabled',
            'sku',
            'outOfStockThreshold',
            'useGlobalOutOfStockThreshold',
            'trackInventory',
        ],
    },
    {
        entityType: VendureEntityType.CUSTOMER,
        fields: [
            ...BASE_FIELDS,
            'deletedAt',
            'title',
            'firstName',
            'lastName',
            'phoneNumber',
            'emailAddress',
            'user',
            'customFields',
        ],
        queryFields: [
            ...BASE_QUERY_FIELDS,
            'deletedAt',
            'title',
            'firstName',
            'lastName',
            'phoneNumber',
            'emailAddress',
        ],
    },
    {
        entityType: VendureEntityType.ORDER,
        fields: [
            ...BASE_FIELDS,
            'type',
            'code',
            'state',
            'active',
            'orderPlacedAt',
            'couponCodes',
            'shippingAddress',
            'billingAddress',
            'currencyCode',
            'customFields',
        ],
        queryFields: [
            ...BASE_QUERY_FIELDS,
            'type',
            'code',
            'state',
            'active',
            'orderPlacedAt',
            'currencyCode',
        ],
    },
    {
        entityType: VendureEntityType.COLLECTION,
        fields: [
            ...BASE_FIELDS,
            'isRoot',
            'position',
            'isPrivate',
            'filters',
            'inheritFilters',
            'name',
            'slug',
            'description',
            'customFields',
        ],
        queryFields: [...BASE_QUERY_FIELDS, 'isRoot', 'position', 'isPrivate', 'inheritFilters'],
    },
    {
        entityType: VendureEntityType.FACET,
        fields: [...BASE_FIELDS, 'isPrivate', 'code', 'name', 'customFields'],
        queryFields: [...BASE_QUERY_FIELDS, 'isPrivate', 'code'],
    },
    {
        entityType: VendureEntityType.FACET_VALUE,
        fields: [...BASE_FIELDS, 'code', 'name', 'customFields'],
        queryFields: [...BASE_QUERY_FIELDS, 'code'],
    },
    {
        entityType: VendureEntityType.PROMOTION,
        fields: [
            ...BASE_FIELDS,
            'deletedAt',
            'startsAt',
            'endsAt',
            'couponCode',
            'perCustomerUsageLimit',
            'usageLimit',
            'enabled',
            'conditions',
            'actions',
            'priorityScore',
            'name',
            'description',
            'customFields',
        ],
        queryFields: [
            ...BASE_QUERY_FIELDS,
            'deletedAt',
            'startsAt',
            'endsAt',
            'couponCode',
            'perCustomerUsageLimit',
            'usageLimit',
            'enabled',
            'priorityScore',
        ],
    },
    {
        entityType: VendureEntityType.ASSET,
        fields: [
            ...BASE_FIELDS,
            'name',
            'type',
            'mimeType',
            'width',
            'height',
            'fileSize',
            'source',
            'preview',
            'focalPoint',
            'customFields',
        ],
        queryFields: [
            ...BASE_QUERY_FIELDS,
            'name',
            'type',
            'mimeType',
            'width',
            'height',
            'fileSize',
            'source',
            'preview',
        ],
    },
] as const;

function fallbackLabel(key: string): string {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, character => character.toUpperCase());
}

function buildExportEntitySchema(definition: ExportEntityDefinition): ExportEntitySchema {
    const code = screamingSnakeToKebab(definition.entityType);
    const sourceSchema = VENDURE_ENTITY_SCHEMAS[code];
    const option = VENDURE_ENTITY_TYPE_OPTIONS.find(item => item.value === definition.entityType);
    const queryFields = new Set(definition.queryFields);

    return {
        entityType: definition.entityType,
        name: option?.label ?? sourceSchema?.label ?? fallbackLabel(code),
        description: sourceSchema?.description ?? '',
        fields: definition.fields.map(key => {
            const sourceField = sourceSchema?.fields[key];
            return {
                key,
                label: sourceField?.label ?? fallbackLabel(key),
                type: sourceField?.type ?? 'string',
                description: sourceField?.description,
                queryable: queryFields.has(key),
            };
        }),
    };
}

export const EXPORT_ENTITY_SCHEMAS: readonly ExportEntitySchema[] =
    EXPORT_ENTITY_DEFINITIONS.map(buildExportEntitySchema);

export function getExportEntitySchema(
    entityType: VendureEntityType | string,
): ExportEntitySchema | undefined {
    const normalized = String(entityType).toUpperCase();
    return EXPORT_ENTITY_SCHEMAS.find(schema => schema.entityType === normalized);
}

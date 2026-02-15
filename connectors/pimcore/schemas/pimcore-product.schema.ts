import { JsonObject } from '../../../src/types';

export const pimcoreProductSchema: JsonObject = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'PimcoreProduct',
    type: 'object',
    required: ['id'],
    properties: {
        id: { type: ['string', 'number'] },
        key: { type: 'string' },
        path: { type: 'string' },
        fullPath: { type: 'string' },
        classname: { type: 'string' },
        published: { type: 'boolean' },
        creationDate: { type: 'number' },
        modificationDate: { type: 'number' },
        sku: { type: 'string' },
        itemNumber: { type: 'string' },
        name: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: ['string', 'null'] } }] },
        description: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: ['string', 'null'] } }] },
        shortDescription: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: ['string', 'null'] } }] },
        slug: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: ['string', 'null'] } }] },
        urlKey: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: ['string', 'null'] } }] },
        price: { type: 'number' },
        images: { type: 'array', items: { $ref: '#/definitions/assetRelation' } },
        assets: { type: 'array', items: { $ref: '#/definitions/assetRelation' } },
        categories: { type: 'array', items: { $ref: '#/definitions/objectRelation' } },
        variants: { type: 'array', items: { $ref: '#/definitions/variant' } },
        channels: { type: 'array', items: { type: 'string' } },
        attributes: { type: 'object', additionalProperties: true },
    },
    definitions: {
        assetRelation: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: ['string', 'number'] },
                filename: { type: 'string' },
                fullPath: { type: 'string' },
                url: { type: 'string' },
                mimetype: { type: 'string' },
                metadata: {
                    type: 'array',
                    items: { type: 'object', properties: { name: { type: 'string' }, language: { type: 'string' }, type: { type: 'string' }, data: {} } },
                },
            },
        },
        objectRelation: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: ['string', 'number'] },
                key: { type: 'string' },
                path: { type: 'string' },
                fullPath: { type: 'string' },
                classname: { type: 'string' },
            },
        },
        variant: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: ['string', 'number'] },
                key: { type: 'string' },
                sku: { type: 'string' },
                itemNumber: { type: 'string' },
                name: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: ['string', 'null'] } }] },
                price: { type: 'number' },
                stockQuantity: { type: 'number' },
                options: { type: 'object', additionalProperties: { type: 'string' } },
                images: { type: 'array', items: { $ref: '#/definitions/assetRelation' } },
            },
        },
    },
} as JsonObject;

export const pimcoreCategorySchema: JsonObject = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'PimcoreCategory',
    type: 'object',
    required: ['id'],
    properties: {
        id: { type: ['string', 'number'] },
        key: { type: 'string' },
        path: { type: 'string' },
        fullPath: { type: 'string' },
        published: { type: 'boolean' },
        index: { type: 'number' },
        name: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: ['string', 'null'] } }] },
        description: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: ['string', 'null'] } }] },
        slug: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: ['string', 'null'] } }] },
        parent: { type: 'object', properties: { id: { type: ['string', 'number'] }, key: { type: 'string' }, fullPath: { type: 'string' } } },
        image: { type: 'object', properties: { id: { type: ['string', 'number'] }, fullPath: { type: 'string' }, filename: { type: 'string' } } },
        children: { type: 'array', items: { $ref: '#' } },
    },
} as JsonObject;

export const pimcoreAssetSchema: JsonObject = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'PimcoreAsset',
    type: 'object',
    required: ['id', 'fullPath'],
    properties: {
        id: { type: ['string', 'number'] },
        filename: { type: 'string' },
        fullPath: { type: 'string' },
        path: { type: 'string' },
        mimetype: { type: 'string' },
        filesize: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        metadata: {
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string' }, language: { type: 'string' }, type: { type: 'string' }, data: {} } },
        },
    },
} as JsonObject;


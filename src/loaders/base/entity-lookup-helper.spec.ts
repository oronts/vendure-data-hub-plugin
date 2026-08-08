import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import {
    createCustomFieldLookupStrategy,
    EntityLookupHelper,
} from './entity-lookup-helper';

describe('EntityLookupHelper', () => {
    it('passes nested custom-field values to lookup strategies', async () => {
        const lookup = vi.fn(async () => ({ id: 'product-1', entity: { id: 'product-1' } }));
        const helper = new EntityLookupHelper<object, { id: string }, Record<string, unknown>>({})
            .addCustomStrategy({ fieldName: 'customFields.externalId', lookup });

        await expect(helper.findExisting(
            {} as RequestContext,
            ['customFields.externalId'],
            { customFields: { externalId: 'erp-1' } },
        )).resolves.toEqual({ id: 'product-1', entity: { id: 'product-1' } });
        expect(lookup).toHaveBeenCalledWith(expect.anything(), {}, 'erp-1');
    });

    it('queries only a configured custom-field column', async () => {
        const getOne = vi.fn(async () => ({ id: 'product-1' }));
        const where = vi.fn(() => ({ getOne }));
        const createQueryBuilder = vi.fn(() => ({
            escape: (value: string) => `"${value}"`,
            where,
        }));
        const connection = {
            getRepository: vi.fn(() => ({
                metadata: {
                    findColumnWithPropertyPath: vi.fn(() => ({
                        databaseName: 'customFieldsExternalId',
                    })),
                },
                createQueryBuilder,
            })),
        };
        class ProductEntity {
            id = 'product-1';
        }
        const strategy = createCustomFieldLookupStrategy(
            connection as never,
            ProductEntity as never,
            'externalId',
        );

        await expect(strategy.lookup(
            {} as RequestContext,
            {},
            'erp-1',
        )).resolves.toEqual({ id: 'product-1', entity: { id: 'product-1' } });
        expect(where).toHaveBeenCalledWith(
            '"lookupEntity"."customFieldsExternalId" = :customFieldValue',
            { customFieldValue: 'erp-1' },
        );
    });

    it('rejects a lookup when the advertised custom field is not configured', async () => {
        class ProductEntity {
            id = 'product-1';
        }
        const strategy = createCustomFieldLookupStrategy(
            {
                getRepository: vi.fn(() => ({
                    metadata: { findColumnWithPropertyPath: vi.fn(() => undefined) },
                })),
            } as never,
            ProductEntity as never,
            'externalId',
        );

        await expect(strategy.lookup(
            {} as RequestContext,
            {},
            'erp-1',
        )).rejects.toThrow('custom field "externalId" is not configured');
    });
});

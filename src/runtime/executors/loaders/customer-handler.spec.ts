import { describe, expect, it, vi } from 'vitest';
import type {
    CustomerGroupService,
    CustomerService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import type { PipelineStepDefinition } from '../../../types';
import { CustomerHandler } from './customer-handler';

function createHandler(options?: { groupItems?: Array<{ id: number; name: string }> }) {
    const customer = { id: 1, emailAddress: 'buyer@example.com' };
    const customerService = {
        findAll: vi.fn(async () => ({ items: [], totalItems: 0 })),
        createOrUpdate: vi.fn(async () => customer),
        getCustomerGroups: vi.fn(async () => []),
        findOne: vi.fn(async () => ({ ...customer, addresses: [] })),
        createAddress: vi.fn(),
        updateAddress: vi.fn(),
        deleteAddress: vi.fn(),
    };
    const customerGroupService = {
        findAll: vi.fn(async () => ({
            items: options?.groupItems ?? [],
            totalItems: options?.groupItems?.length ?? 0,
        })),
        addCustomersToGroup: vi.fn(),
        removeCustomersFromGroup: vi.fn(),
    };
    const connection = {
        withTransaction: vi.fn(async (ctx, work) => work(ctx)),
    };
    const handler = new CustomerHandler(
        customerService as unknown as CustomerService,
        customerGroupService as unknown as CustomerGroupService,
        connection as unknown as TransactionalConnection,
    );
    return { handler, customerService, customerGroupService, connection };
}

function step(config: Record<string, unknown>): PipelineStepDefinition {
    return {
        key: 'customer',
        type: 'LOAD',
        config: { adapterCode: 'customerUpsert', ...config },
    } as PipelineStepDefinition;
}

describe('CustomerHandler record integrity', () => {
    it('validates address mode before mutating the customer', async () => {
        const { handler, customerService } = createHandler();
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        await expect(handler.execute(
            {} as RequestContext,
            step({ addressesField: 'addresses', addressesMode: 'UPDATE_BY_ID' }),
            [{
                email: 'buyer@example.com',
                addresses: [{ streetLine1: 'Main 1', countryCode: 'DE' }],
            }],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(customerService.createOrUpdate).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'customer',
            'Unsupported customer address mode "UPDATE_BY_ID"',
            expect.anything(),
            expect.any(String),
        );
    });

    it('fails the record when a requested group does not exist', async () => {
        const { handler, customerGroupService } = createHandler();
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        await expect(handler.execute(
            {} as RequestContext,
            step({ groupsField: 'groups' }),
            [{ email: 'buyer@example.com', groups: ['Missing'] }],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(customerGroupService.addCustomersToGroup).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'customer',
            'Customer group not found: Missing',
            expect.anything(),
            expect.any(String),
        );
    });

    it('rejects unsupported group modes before processing records', async () => {
        const { handler, customerService } = createHandler();

        await expect(handler.execute(
            {} as RequestContext,
            step({ groupsField: 'groups', groupsMode: 'add' }),
            [{ email: 'buyer@example.com', groups: ['Premium'] }],
        )).rejects.toThrow('Unsupported customer groups mode "add"');
        expect(customerService.createOrUpdate).not.toHaveBeenCalled();
    });

    it('rejects unsupported strategies and non-boolean duplicate flags', async () => {
        const { handler, customerService } = createHandler();

        await expect(handler.execute(
            {} as RequestContext,
            step({ strategy: 'create' }),
            [{ email: 'buyer@example.com' }],
        )).rejects.toThrow('Unsupported load strategy "create"');
        await expect(handler.execute(
            {} as RequestContext,
            step({ skipDuplicates: 'true' }),
            [{ email: 'buyer@example.com' }],
        )).rejects.toThrow('skipDuplicates must be a boolean');
        expect(customerService.createOrUpdate).not.toHaveBeenCalled();
    });
});

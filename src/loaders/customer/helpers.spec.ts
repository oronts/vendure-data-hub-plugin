import { describe, expect, it, vi } from 'vitest';
import type { Address, Country, CustomerService, CountryService, RequestContext } from '@vendure/core';
import type { DataHubLogger } from '../../services/logger/datahub-logger';
import type { CustomerAddressInput } from './types';
import { handleCustomerAddresses } from './helpers';

const INPUT_ADDRESS: CustomerAddressInput = {
    streetLine1: 'Main Street 1',
    city: 'Berlin',
    postalCode: '10115',
    countryCode: 'DE',
};

function createDependencies() {
    const existingAddress = {
        id: 'address-owned-by-customer',
        streetLine1: INPUT_ADDRESS.streetLine1,
        city: INPUT_ADDRESS.city,
        country: { code: INPUT_ADDRESS.countryCode },
    } as Address;
    const customerService = {
        findOne: vi.fn().mockResolvedValue({ id: 'customer-1', addresses: [existingAddress] }),
        createAddress: vi.fn().mockResolvedValue({ id: 'created-address' }),
        updateAddress: vi.fn().mockResolvedValue(existingAddress),
        deleteAddress: vi.fn().mockResolvedValue(undefined),
    };
    const countryService = {
        findAll: vi.fn().mockResolvedValue({
            items: [{ code: 'DE' } as Country],
            totalItems: 1,
        }),
    };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
    };
    return {
        existingAddress,
        customerService,
        countryService,
        logger,
    };
}

async function handle(
    dependencies: ReturnType<typeof createDependencies>,
    mode: 'UPSERT_BY_MATCH' | 'REPLACE_ALL' | 'APPEND_ONLY' | 'SKIP',
    addresses: CustomerAddressInput[] = [INPUT_ADDRESS],
) {
    return handleCustomerAddresses(
        {} as RequestContext,
        dependencies.customerService as unknown as CustomerService,
        dependencies.countryService as unknown as CountryService,
        'customer-1',
        addresses,
        { mode, matchFields: ['streetLine1', 'city', 'countryCode'] },
        dependencies.logger as unknown as DataHubLogger,
    );
}

describe('handleCustomerAddresses', () => {
    it('never trusts a source-provided address ID when matching an update', async () => {
        const dependencies = createDependencies();
        const untrustedAddress = {
            ...INPUT_ADDRESS,
            id: 'address-owned-by-another-customer',
        } as CustomerAddressInput;

        await handle(dependencies, 'UPSERT_BY_MATCH', [untrustedAddress]);

        expect(dependencies.customerService.updateAddress).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ id: dependencies.existingAddress.id }),
        );
        expect(dependencies.customerService.updateAddress).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ id: 'address-owned-by-another-customer' }),
        );
    });

    it('does not delete existing addresses when replacement creation fails', async () => {
        const dependencies = createDependencies();
        dependencies.customerService.createAddress.mockRejectedValueOnce(new Error('create failed'));

        await expect(handle(dependencies, 'REPLACE_ALL')).rejects.toThrow('create failed');

        expect(dependencies.customerService.deleteAddress).not.toHaveBeenCalled();
    });

    it('creates the complete replacement before deleting existing addresses', async () => {
        const dependencies = createDependencies();

        await handle(dependencies, 'REPLACE_ALL');

        const createOrder = dependencies.customerService.createAddress.mock.invocationCallOrder[0];
        const deleteOrder = dependencies.customerService.deleteAddress.mock.invocationCallOrder[0];
        expect(createOrder).toBeLessThan(deleteOrder);
    });

    it('rejects unknown countries before creating any address', async () => {
        const dependencies = createDependencies();
        dependencies.countryService.findAll.mockResolvedValue({ items: [], totalItems: 0 });

        await expect(handle(dependencies, 'APPEND_ONLY')).rejects.toThrow('Unknown country code(s): DE');

        expect(dependencies.customerService.createAddress).not.toHaveBeenCalled();
    });
});

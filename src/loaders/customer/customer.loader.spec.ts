import {
    CountryService,
    CustomerGroupService,
    CustomerService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { TARGET_OPERATION } from '../../constants';
import type { DataHubLoggerFactory } from '../../services/logger';
import type { LoaderContext } from '../../types';
import { CustomerLoader } from './customer.loader';
import type { CustomerInput } from './types';

const ctx = {} as RequestContext;

function createLoader() {
    const customerService = {
        update: vi.fn(),
        createAddress: vi.fn(),
    };
    const customerGroupService = {
        findAll: vi.fn(),
        addCustomersToGroup: vi.fn(),
    };
    const logger = {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
    };
    const loader = new CustomerLoader(
        {} as TransactionalConnection,
        customerService as unknown as CustomerService,
        customerGroupService as unknown as CustomerGroupService,
        {} as CountryService,
        { createLogger: vi.fn(() => logger) } as unknown as DataHubLoggerFactory,
    );
    return { customerService, customerGroupService, loader };
}

const context: LoaderContext = {
    ctx,
    pipelineId: 'pipeline-1',
    runId: 'run-1',
    operation: TARGET_OPERATION.UPDATE,
    lookupFields: ['emailAddress'],
    dryRun: false,
    options: { config: {} },
};

async function update(loader: CustomerLoader, record: CustomerInput): Promise<void> {
    await (loader as unknown as {
        updateEntity(
            loaderContext: LoaderContext,
            customerId: string,
            input: CustomerInput,
        ): Promise<void>;
    }).updateEntity(context, 'customer-1', record);
}

describe('CustomerLoader', () => {
    it('stops secondary mutations when Vendure rejects the customer update', async () => {
        const { customerService, customerGroupService, loader } = createLoader();
        customerService.update.mockResolvedValue({
            errorCode: 'EMAIL_ADDRESS_CONFLICT_ERROR',
            message: 'Email address already exists',
        });

        await expect(update(loader, {
            emailAddress: 'buyer@example.com',
            firstName: 'Buyer',
            lastName: 'Example',
            groupCodes: ['vip'],
            addresses: [{
                streetLine1: 'Main Street 1',
                city: 'Berlin',
                postalCode: '10115',
                countryCode: 'DE',
            }],
        })).rejects.toThrow('Failed to update customer: Email address already exists');
        expect(customerGroupService.findAll).not.toHaveBeenCalled();
        expect(customerGroupService.addCustomersToGroup).not.toHaveBeenCalled();
        expect(customerService.createAddress).not.toHaveBeenCalled();
    });
});

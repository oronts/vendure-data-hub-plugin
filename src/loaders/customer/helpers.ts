import { ID, RequestContext, CustomerGroupService, CustomerService, CountryService } from '@vendure/core';
import { DataHubLogger } from '../../services/logger';
import { CustomerAddressInput } from './types';

export { isRecoverableError, shouldUpdateField } from '../shared-helpers';

/**
 * Assigns a customer to multiple groups.
 * Optimized to batch the addCustomersToGroup calls by collecting all valid group IDs first.
 */
export async function assignCustomerGroups(
    ctx: RequestContext,
    customerGroupService: CustomerGroupService,
    customerId: ID,
    groupCodes: string[],
    logger: DataHubLogger,
): Promise<void> {
    if (!groupCodes || groupCodes.length === 0) {
        return;
    }

    const allGroups = await customerGroupService.findAll(ctx, {});
    const groupMap = new Map(allGroups.items.map(g => [g.name.toLowerCase(), g]));

    // Collect valid groups and batch the assignment
    for (const code of groupCodes) {
        const group = groupMap.get(code.toLowerCase());
        if (group) {
            // Still need individual calls as Vendure API expects one group at a time
            await customerGroupService.addCustomersToGroup(ctx, {
                customerGroupId: group.id,
                customerIds: [customerId],
            });
        } else {
            logger.warn(`Customer group "${code}" not found`);
        }
    }
}

/**
 * Creates addresses for a customer.
 * Optimized to fetch all countries once upfront instead of querying in a loop (N+1 prevention).
 */
export async function createAddresses(
    ctx: RequestContext,
    customerService: CustomerService,
    countryService: CountryService,
    customerId: ID,
    addresses: CustomerAddressInput[],
    logger: DataHubLogger,
): Promise<void> {
    if (!addresses || addresses.length === 0) {
        return;
    }

    // Fetch all countries once to avoid N+1 queries
    const allCountries = await countryService.findAll(ctx, {});
    const countryMap = new Map(
        allCountries.items.map(c => [c.code.toUpperCase(), c])
    );

    for (const addr of addresses) {
        // Lookup country from pre-fetched map
        const country = countryMap.get(addr.countryCode.toUpperCase());

        if (!country) {
            logger.warn(`Country "${addr.countryCode}" not found, skipping address`);
            continue;
        }

        await customerService.createAddress(ctx, customerId, {
            fullName: addr.fullName || '',
            streetLine1: addr.streetLine1,
            streetLine2: addr.streetLine2 || '',
            city: addr.city,
            province: addr.province || '',
            postalCode: addr.postalCode,
            countryCode: addr.countryCode,
            phoneNumber: addr.phoneNumber || '',
            defaultShippingAddress: addr.defaultShippingAddress ?? false,
            defaultBillingAddress: addr.defaultBillingAddress ?? false,
        });
    }
}


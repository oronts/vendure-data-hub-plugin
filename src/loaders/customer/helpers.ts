import { ID, RequestContext, CustomerGroupService, CustomerService, CountryService } from '@vendure/core';
import { DataHubLogger } from '../../services/logger';
import { CustomerAddressInput } from './types';

export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

export async function assignCustomerGroups(
    ctx: RequestContext,
    customerGroupService: CustomerGroupService,
    customerId: ID,
    groupCodes: string[],
    logger: DataHubLogger,
): Promise<void> {
    const allGroups = await customerGroupService.findAll(ctx, {});

    for (const code of groupCodes) {
        const group = allGroups.items.find(g => g.name === code);
        if (group) {
            await customerGroupService.addCustomersToGroup(ctx, {
                customerGroupId: group.id,
                customerIds: [customerId],
            });
        } else {
            logger.warn(`Customer group "${code}" not found`);
        }
    }
}

export async function createAddresses(
    ctx: RequestContext,
    customerService: CustomerService,
    countryService: CountryService,
    customerId: ID,
    addresses: CustomerAddressInput[],
    logger: DataHubLogger,
): Promise<void> {
    for (const addr of addresses) {
        // Get country ID from code
        const countries = await countryService.findAll(ctx, {
            filter: { code: { eq: addr.countryCode } },
        });

        if (countries.totalItems === 0) {
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

export function isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('connection') ||
            message.includes('temporarily')
        );
    }
    return false;
}

export function shouldUpdateField(
    field: string,
    updateOnlyFields?: string[],
): boolean {
    if (!updateOnlyFields || updateOnlyFields.length === 0) {
        return true;
    }
    return updateOnlyFields.includes(field);
}

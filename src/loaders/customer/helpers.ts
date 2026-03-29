import { ID, RequestContext, CustomerGroupService, CustomerService, CountryService, Address } from '@vendure/core';
import { DataHubLogger } from '../../services/logger';
import { CustomerAddressInput } from './types';
import type { AddressesMode } from '../../../shared/types/adapter-config.types';
import { PAGINATION } from '../../constants/defaults';

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

    const allGroups = await customerGroupService.findAll(ctx, { take: PAGINATION.MAX_LOOKUP_LIMIT });
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
 * Handles customer addresses with configurable modes to prevent duplicates.
 *
 * @param ctx - Request context
 * @param customerService - Vendure CustomerService
 * @param countryService - Vendure CountryService
 * @param customerId - Customer ID
 * @param newAddresses - Addresses from source data
 * @param options - Mode and match configuration
 * @param logger - Logger instance
 */
export async function handleCustomerAddresses(
    ctx: RequestContext,
    customerService: CustomerService,
    countryService: CountryService,
    customerId: ID,
    newAddresses: CustomerAddressInput[],
    options: { mode: AddressesMode; matchFields: string[] },
    logger: DataHubLogger,
): Promise<void> {
    if (!newAddresses || newAddresses.length === 0) {
        return;
    }

    switch (options.mode) {
        case 'SKIP':
            logger.debug(`Skipping address handling for customer ${customerId}`);
            return;

        case 'REPLACE_ALL':
            await replaceAllAddresses(ctx, customerService, countryService, customerId, newAddresses, logger);
            break;

        case 'UPSERT_BY_MATCH':
            await upsertAddressesByMatch(ctx, customerService, countryService, customerId, newAddresses, options.matchFields, logger);
            break;

        case 'APPEND_ONLY':
            await appendAddresses(ctx, customerService, countryService, customerId, newAddresses, logger);
            break;

        case 'UPDATE_BY_ID':
            await updateAddressesByID(ctx, customerService, countryService, customerId, newAddresses, logger);
            break;
    }
}

/**
 * REPLACE_ALL mode: Delete all existing addresses and create new ones from source.
 */
async function replaceAllAddresses(
    ctx: RequestContext,
    customerService: CustomerService,
    countryService: CountryService,
    customerId: ID,
    newAddresses: CustomerAddressInput[],
    logger: DataHubLogger,
): Promise<void> {
    // Get existing addresses, load country relation for consistency
    const customer = await customerService.findOne(ctx, customerId, ['addresses', 'addresses.country']);
    if (!customer) return;

    // Delete all existing addresses
    for (const addr of customer.addresses || []) {
        await customerService.deleteAddress(ctx, addr.id);
    }
    logger.debug(`Deleted ${customer.addresses?.length || 0} existing addresses for customer ${customerId}`);

    await createAddressesInternal(ctx, customerService, countryService, customerId, newAddresses, logger);
}

/**
 * UPSERT_BY_MATCH mode: Match existing addresses by specified fields.
 * Update if match found, create if not. Prevents duplicates.
 */
async function upsertAddressesByMatch(
    ctx: RequestContext,
    customerService: CustomerService,
    countryService: CountryService,
    customerId: ID,
    newAddresses: CustomerAddressInput[],
    matchFields: string[],
    logger: DataHubLogger,
): Promise<void> {
    // Get existing addresses, load country relation for countryCode matching
    const customer = await customerService.findOne(ctx, customerId, ['addresses', 'addresses.country']);
    if (!customer) return;

    const existingAddresses = customer.addresses || [];

    // Fetch countries once
    const allCountries = await countryService.findAll(ctx, { take: PAGINATION.MAX_LOOKUP_LIMIT });
    const countryMap = new Map(allCountries.items.map(c => [c.code.toUpperCase(), c]));

    for (const newAddr of newAddresses) {
        // Find matching existing address
        const matchingAddr = existingAddresses.find(existing =>
            matchesByFields(existing, newAddr, matchFields)
        );

        if (matchingAddr) {
            // Update existing address
            await customerService.updateAddress(ctx, {
                id: matchingAddr.id,
                fullName: newAddr.fullName,
                streetLine1: newAddr.streetLine1,
                streetLine2: newAddr.streetLine2,
                city: newAddr.city,
                province: newAddr.province,
                postalCode: newAddr.postalCode,
                countryCode: newAddr.countryCode,
                phoneNumber: newAddr.phoneNumber,
                defaultShippingAddress: newAddr.defaultShippingAddress,
                defaultBillingAddress: newAddr.defaultBillingAddress,
            });
            logger.debug(`Updated existing address ${matchingAddr.id} for customer ${customerId}`);
        } else {
            const country = countryMap.get(newAddr.countryCode.toUpperCase());
            if (!country) {
                logger.warn(`Country "${newAddr.countryCode}" not found, skipping address`);
                continue;
            }

            await customerService.createAddress(ctx, customerId, {
                fullName: newAddr.fullName || '',
                streetLine1: newAddr.streetLine1,
                streetLine2: newAddr.streetLine2 || '',
                city: newAddr.city,
                province: newAddr.province || '',
                postalCode: newAddr.postalCode,
                countryCode: newAddr.countryCode,
                phoneNumber: newAddr.phoneNumber || '',
                defaultShippingAddress: newAddr.defaultShippingAddress ?? false,
                defaultBillingAddress: newAddr.defaultBillingAddress ?? false,
            });
            logger.debug(`Created new address for customer ${customerId}`);
        }
    }
}

/**
 * APPEND_ONLY mode: Always create new addresses (allows duplicates).
 */
async function appendAddresses(
    ctx: RequestContext,
    customerService: CustomerService,
    countryService: CountryService,
    customerId: ID,
    newAddresses: CustomerAddressInput[],
    logger: DataHubLogger,
): Promise<void> {
    await createAddressesInternal(ctx, customerService, countryService, customerId, newAddresses, logger);
}

/**
 * UPDATE_BY_ID mode: Update addresses by Vendure ID if provided, create if not.
 */
async function updateAddressesByID(
    ctx: RequestContext,
    customerService: CustomerService,
    countryService: CountryService,
    customerId: ID,
    newAddresses: CustomerAddressInput[],
    logger: DataHubLogger,
): Promise<void> {
    const allCountries = await countryService.findAll(ctx, { take: PAGINATION.MAX_LOOKUP_LIMIT });
    const countryMap = new Map(allCountries.items.map(c => [c.code.toUpperCase(), c]));

    for (const newAddr of newAddresses) {
        // Vendure API accepts dynamic input; id may be present on records for direct update
        if ((newAddr as any).id) {
            await customerService.updateAddress(ctx, {
                id: (newAddr as any).id,
                fullName: newAddr.fullName,
                streetLine1: newAddr.streetLine1,
                streetLine2: newAddr.streetLine2,
                city: newAddr.city,
                province: newAddr.province,
                postalCode: newAddr.postalCode,
                countryCode: newAddr.countryCode,
                phoneNumber: newAddr.phoneNumber,
                defaultShippingAddress: newAddr.defaultShippingAddress,
                defaultBillingAddress: newAddr.defaultBillingAddress,
            });
            logger.debug(`Updated address ${(newAddr as any).id} for customer ${customerId}`); // Vendure API accepts dynamic input
        } else {
            const country = countryMap.get(newAddr.countryCode.toUpperCase());
            if (!country) {
                logger.warn(`Country "${newAddr.countryCode}" not found, skipping address`);
                continue;
            }

            await customerService.createAddress(ctx, customerId, {
                fullName: newAddr.fullName || '',
                streetLine1: newAddr.streetLine1,
                streetLine2: newAddr.streetLine2 || '',
                city: newAddr.city,
                province: newAddr.province || '',
                postalCode: newAddr.postalCode,
                countryCode: newAddr.countryCode,
                phoneNumber: newAddr.phoneNumber || '',
                defaultShippingAddress: newAddr.defaultShippingAddress ?? false,
                defaultBillingAddress: newAddr.defaultBillingAddress ?? false,
            });
            logger.debug(`Created new address for customer ${customerId}`);
        }
    }
}

/**
 * Helper: Match addresses by specified fields with normalization.
 */
function matchesByFields(existing: Address, newAddr: CustomerAddressInput, matchFields: string[]): boolean {
    return matchFields.every(field => {
        const existingValue = getFieldValue(existing, field);
        const newValue = getFieldValue(newAddr, field);

        // Normalize for comparison (trim, lowercase, handle country)
        const normalizeValue = (val: any) => {
            if (typeof val === 'string') return val.trim().toLowerCase();
            if (val && typeof val === 'object' && 'code' in val) return val.code.toLowerCase();
            return val;
        };

        return normalizeValue(existingValue) === normalizeValue(newValue);
    });
}

/**
 * Helper: Get field value from address, handling country object vs code.
 */
function getFieldValue(obj: any, field: string): any {
    if (field === 'countryCode') {
        return obj.country?.code || obj.countryCode;
    }
    return obj[field];
}

/**
 * Internal helper: Create addresses (used by REPLACE_ALL, APPEND_ONLY).
 * Optimized to fetch all countries once upfront instead of querying in a loop (N+1 prevention).
 */
async function createAddressesInternal(
    ctx: RequestContext,
    customerService: CustomerService,
    countryService: CountryService,
    customerId: ID,
    addresses: CustomerAddressInput[],
    logger: DataHubLogger,
): Promise<void> {
    const allCountries = await countryService.findAll(ctx, { take: PAGINATION.MAX_LOOKUP_LIMIT });
    const countryMap = new Map(
        allCountries.items.map(c => [c.code.toUpperCase(), c])
    );

    for (const addr of addresses) {
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

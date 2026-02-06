import { ID, RequestContext, CustomerService, ShippingMethodService } from '@vendure/core';
import { OrderAddressInput } from './types';

export { isRecoverableError, shouldUpdateField, findVariantBySku } from '../shared-helpers';

export function validateAddress(
    address: OrderAddressInput,
    prefix: string,
): { field: string; message: string; code?: string }[] {
    const errors: { field: string; message: string; code?: string }[] = [];

    if (!address.streetLine1) {
        errors.push({ field: `${prefix}.streetLine1`, message: 'Street line 1 is required', code: 'REQUIRED' });
    }
    if (!address.city) {
        errors.push({ field: `${prefix}.city`, message: 'City is required', code: 'REQUIRED' });
    }
    if (!address.postalCode) {
        errors.push({ field: `${prefix}.postalCode`, message: 'Postal code is required', code: 'REQUIRED' });
    }
    if (!address.countryCode) {
        errors.push({ field: `${prefix}.countryCode`, message: 'Country code is required', code: 'REQUIRED' });
    }

    return errors;
}

export async function findCustomerByEmail(
    ctx: RequestContext,
    customerService: CustomerService,
    email: string,
): Promise<{ id: ID } | null> {
    const customers = await customerService.findAll(ctx, {
        filter: { emailAddress: { eq: email } },
    });
    return customers.totalItems > 0 ? { id: customers.items[0].id } : null;
}

export async function findShippingMethodByCode(
    ctx: RequestContext,
    shippingMethodService: ShippingMethodService,
    code: string,
): Promise<{ id: ID } | null> {
    const methods = await shippingMethodService.findAll(ctx, {
        filter: { code: { eq: code } },
    });
    return methods.totalItems > 0 ? { id: methods.items[0].id } : null;
}


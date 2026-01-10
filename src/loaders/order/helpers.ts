import { ID, RequestContext, CustomerService, ProductVariantService, ShippingMethodService } from '@vendure/core';
import { OrderAddressInput } from './types';

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

export async function findVariantBySku(
    ctx: RequestContext,
    productVariantService: ProductVariantService,
    sku: string,
): Promise<{ id: ID } | null> {
    const variants = await productVariantService.findAll(ctx, {
        filter: { sku: { eq: sku } },
    });
    return variants.totalItems > 0 ? { id: variants.items[0].id } : null;
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

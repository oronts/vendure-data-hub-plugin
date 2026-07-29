import type { CreateAddressInput } from '@vendure/common/lib/generated-types';
import type { CustomerService, ID, RequestContext } from '@vendure/core';
import type { AddressesMode } from '../../../../shared/types';
import { getArrayValue } from '../../../loaders/shared-helpers';
import type { RecordObject } from '../../executor-types';

export interface CustomerAddressConfig {
    addressesField?: string;
    addressesMode?: AddressesMode;
    addressMatchFields?: string;
}

interface AddressRecord {
    streetLine1?: string;
    streetLine2?: string;
    address1?: string;
    address2?: string;
    city?: string;
    postalCode?: string;
    zip?: string;
    countryCode?: string;
    phoneNumber?: string;
    province?: string;
    company?: string;
    fullName?: string;
    defaultShippingAddress?: boolean;
    defaultBillingAddress?: boolean;
}

export interface PreparedCustomerAddresses {
    mode: AddressesMode;
    inputs: CreateAddressInput[];
    matchFields: string[];
}

const ADDRESS_MODES = new Set<AddressesMode>([
    'UPSERT_BY_MATCH',
    'REPLACE_ALL',
    'APPEND_ONLY',
    'SKIP',
]);

function isAddressRecord(value: unknown): value is AddressRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toCreateAddressInput(address: AddressRecord): CreateAddressInput {
    const streetLine1 = (address.streetLine1 ?? address.address1 ?? '').trim();
    const countryCode = (address.countryCode ?? '').trim().toUpperCase();
    if (!streetLine1 || !countryCode) {
        throw new Error('Customer addresses require streetLine1 and countryCode');
    }
    return {
        streetLine1,
        streetLine2: address.streetLine2 ?? address.address2,
        city: address.city,
        postalCode: address.postalCode ?? address.zip,
        countryCode,
        phoneNumber: address.phoneNumber,
        province: address.province,
        company: address.company,
        fullName: address.fullName,
        defaultShippingAddress: address.defaultShippingAddress,
        defaultBillingAddress: address.defaultBillingAddress,
    };
}

export function prepareCustomerAddresses(
    record: RecordObject,
    config: CustomerAddressConfig,
): PreparedCustomerAddresses | undefined {
    if (!config.addressesField) {
        return undefined;
    }

    const rawAddresses = getArrayValue<unknown>(record, config.addressesField);
    if (!rawAddresses) {
        return undefined;
    }

    const mode = config.addressesMode ?? 'UPSERT_BY_MATCH';
    if (!ADDRESS_MODES.has(mode)) {
        throw new Error(`Unsupported customer address mode "${String(mode)}"`);
    }

    const matchFields = (config.addressMatchFields ?? 'streetLine1,city,countryCode')
        .split(',')
        .map(field => field.trim())
        .filter(Boolean);
    if (mode === 'UPSERT_BY_MATCH' && matchFields.length === 0) {
        throw new Error('Customer address matching requires at least one match field');
    }

    const inputs = mode === 'SKIP'
        ? []
        : rawAddresses.map((address, index) => {
            if (!isAddressRecord(address)) {
                throw new Error(`Customer address at index ${index} must be an object`);
            }
            return toCreateAddressInput(address);
        });

    return { mode, inputs, matchFields };
}

export async function applyCustomerAddresses(
    customerService: CustomerService,
    ctx: RequestContext,
    customerId: ID,
    prepared: PreparedCustomerAddresses | undefined,
): Promise<void> {
    if (!prepared || prepared.mode === 'SKIP') {
        return;
    }

    if (prepared.mode === 'APPEND_ONLY') {
        await createAddresses(customerService, ctx, customerId, prepared.inputs);
        return;
    }

    const customer = await customerService.findOne(
        ctx,
        customerId,
        ['addresses', 'addresses.country'],
    );
    if (!customer) {
        throw new Error(`Customer "${String(customerId)}" not found while processing addresses`);
    }
    const existingAddresses = customer.addresses ?? [];

    if (prepared.mode === 'REPLACE_ALL') {
        await createAddresses(customerService, ctx, customerId, prepared.inputs);
        for (const existing of existingAddresses) {
            await customerService.deleteAddress(ctx, existing.id);
        }
        return;
    }

    for (const input of prepared.inputs) {
        const match = existingAddresses.find(existing =>
            prepared.matchFields.every(field =>
                normalizedAddressValue(existing as unknown as Record<string, unknown>, field)
                    === normalizedAddressValue(input as unknown as Record<string, unknown>, field),
            ),
        );
        if (match) {
            await customerService.updateAddress(ctx, { id: match.id, ...input });
        } else {
            await customerService.createAddress(ctx, customerId, input);
        }
    }
}

async function createAddresses(
    customerService: CustomerService,
    ctx: RequestContext,
    customerId: ID,
    inputs: CreateAddressInput[],
): Promise<void> {
    for (const input of inputs) {
        await customerService.createAddress(ctx, customerId, input);
    }
}

function normalizedAddressValue(
    address: Record<string, unknown>,
    field: string,
): string | undefined {
    const value = field === 'countryCode'
        ? getCountryCode(address)
        : address[field];
    if (value === undefined || value === null) {
        return undefined;
    }
    return String(value).trim().toLowerCase();
}

function getCountryCode(address: Record<string, unknown>): unknown {
    const country = address.country;
    if (country && typeof country === 'object' && 'code' in country) {
        return (country as Record<string, unknown>).code;
    }
    return address.countryCode;
}

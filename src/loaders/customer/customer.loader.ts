import { Injectable } from '@nestjs/common';
import {
    ID,
    Customer,
    RequestContext,
    TransactionalConnection,
    CustomerService,
    CustomerGroupService,
    CountryService,
} from '@vendure/core';
import {
    LoaderContext,
    EntityValidationResult,
    EntityFieldSchema,
    TargetOperation,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import { BaseEntityLoader, ExistingEntityLookupResult, LoaderMetadata } from '../base';
import {
    CustomerInput,
    CUSTOMER_LOADER_METADATA,
} from './types';
import {
    isValidEmail,
    assignCustomerGroups,
    createAddresses,
    shouldUpdateField,
} from './helpers';

/**
 * CustomerLoader - Refactored to extend BaseEntityLoader
 *
 * This eliminates ~60 lines of duplicate load() method code that was
 * copy-pasted across all loaders. The base class handles:
 * - Result initialization
 * - Validation loop
 * - Duplicate detection
 * - CREATE/UPDATE/UPSERT operation logic
 * - Dry run mode
 * - Error handling
 */
@Injectable()
export class CustomerLoader extends BaseEntityLoader<CustomerInput, Customer> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = CUSTOMER_LOADER_METADATA;

    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private customerGroupService: CustomerGroupService,
        private countryService: CountryService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CUSTOMER_LOADER);
    }

    protected getDuplicateErrorMessage(record: CustomerInput): string {
        return `Customer with email "${record.emailAddress}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: CustomerInput,
    ): Promise<ExistingEntityLookupResult<Customer> | null> {
        // Primary lookup: by email
        if (record.emailAddress && lookupFields.includes('emailAddress')) {
            const customers = await this.customerService.findAll(ctx, {
                filter: { emailAddress: { eq: record.emailAddress } },
            });

            if (customers.totalItems > 0) {
                return { id: customers.items[0].id, entity: customers.items[0] };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const customer = await this.customerService.findOne(ctx, record.id as ID);
            if (customer) {
                return { id: customer.id, entity: customer };
            }
        }

        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: CustomerInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        // Required field validation
        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            if (!record.emailAddress || typeof record.emailAddress !== 'string' || record.emailAddress.trim() === '') {
                errors.push({ field: 'emailAddress', message: 'Email address is required', code: 'REQUIRED' });
            } else if (!isValidEmail(record.emailAddress)) {
                errors.push({ field: 'emailAddress', message: 'Invalid email format', code: 'INVALID_FORMAT' });
            }

            if (!record.firstName || typeof record.firstName !== 'string' || record.firstName.trim() === '') {
                errors.push({ field: 'firstName', message: 'First name is required', code: 'REQUIRED' });
            }

            if (!record.lastName || typeof record.lastName !== 'string' || record.lastName.trim() === '') {
                errors.push({ field: 'lastName', message: 'Last name is required', code: 'REQUIRED' });
            }
        }

        // Validate addresses if provided
        if (record.addresses && Array.isArray(record.addresses)) {
            for (let i = 0; i < record.addresses.length; i++) {
                const addr = record.addresses[i];
                if (!addr.streetLine1) {
                    errors.push({ field: `addresses[${i}].streetLine1`, message: 'Street line 1 is required', code: 'REQUIRED' });
                }
                if (!addr.city) {
                    errors.push({ field: `addresses[${i}].city`, message: 'City is required', code: 'REQUIRED' });
                }
                if (!addr.countryCode) {
                    errors.push({ field: `addresses[${i}].countryCode`, message: 'Country code is required', code: 'REQUIRED' });
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.CUSTOMER,
            fields: [
                {
                    key: 'emailAddress',
                    label: 'Email Address',
                    type: 'string',
                    required: true,
                    lookupable: true,
                    description: 'Unique email address',
                    example: 'john.doe@example.com',
                },
                {
                    key: 'firstName',
                    label: 'First Name',
                    type: 'string',
                    required: true,
                    description: 'Customer first name',
                },
                {
                    key: 'lastName',
                    label: 'Last Name',
                    type: 'string',
                    required: true,
                    description: 'Customer last name',
                },
                {
                    key: 'phoneNumber',
                    label: 'Phone Number',
                    type: 'string',
                    description: 'Contact phone number',
                },
                {
                    key: 'title',
                    label: 'Title',
                    type: 'string',
                    description: 'Title (Mr, Mrs, etc.)',
                },
                {
                    key: 'groupCodes',
                    label: 'Customer Groups',
                    type: 'array',
                    description: 'Array of customer group codes to assign',
                    example: ['vip', 'wholesale'],
                },
                {
                    key: 'addresses',
                    label: 'Addresses',
                    type: 'array',
                    description: 'Array of customer addresses',
                    children: [
                        { key: 'fullName', label: 'Full Name', type: 'string' },
                        { key: 'streetLine1', label: 'Street Line 1', type: 'string', required: true },
                        { key: 'streetLine2', label: 'Street Line 2', type: 'string' },
                        { key: 'city', label: 'City', type: 'string', required: true },
                        { key: 'province', label: 'Province/State', type: 'string' },
                        { key: 'postalCode', label: 'Postal Code', type: 'string', required: true },
                        { key: 'countryCode', label: 'Country Code', type: 'string', required: true },
                        { key: 'phoneNumber', label: 'Phone Number', type: 'string' },
                        { key: 'defaultShippingAddress', label: 'Default Shipping', type: 'boolean' },
                        { key: 'defaultBillingAddress', label: 'Default Billing', type: 'boolean' },
                    ],
                },
                {
                    key: 'customFields',
                    label: 'Custom Fields',
                    type: 'object',
                    description: 'Custom field values',
                },
            ],
        };
    }

    protected async createEntity(context: LoaderContext, record: CustomerInput): Promise<ID | null> {
        const { ctx } = context;

        const result = await this.customerService.create(ctx, {
            emailAddress: record.emailAddress,
            firstName: record.firstName,
            lastName: record.lastName,
            phoneNumber: record.phoneNumber,
            title: record.title,
            customFields: record.customFields as Record<string, unknown>,
        });

        if ('errorCode' in result) {
            throw new Error(`Failed to create customer: ${result.message}`);
        }

        const customer = result;

        if (record.groupCodes && record.groupCodes.length > 0) {
            await assignCustomerGroups(ctx, this.customerGroupService, customer.id, record.groupCodes, this.logger);
        }

        if (record.addresses && record.addresses.length > 0) {
            await createAddresses(ctx, this.customerService, this.countryService, customer.id, record.addresses, this.logger);
        }

        this.logger.log(`Created customer ${record.emailAddress} (ID: ${customer.id})`);
        return customer.id;
    }

    protected async updateEntity(context: LoaderContext, customerId: ID, record: CustomerInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: customerId };

        if (record.firstName !== undefined && shouldUpdateField('firstName', options.updateOnlyFields)) {
            updateInput.firstName = record.firstName;
        }
        if (record.lastName !== undefined && shouldUpdateField('lastName', options.updateOnlyFields)) {
            updateInput.lastName = record.lastName;
        }
        if (record.phoneNumber !== undefined && shouldUpdateField('phoneNumber', options.updateOnlyFields)) {
            updateInput.phoneNumber = record.phoneNumber;
        }
        if (record.title !== undefined && shouldUpdateField('title', options.updateOnlyFields)) {
            updateInput.title = record.title;
        }
        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        await this.customerService.update(ctx, updateInput as Parameters<typeof this.customerService.update>[1]);

        if (record.groupCodes && shouldUpdateField('groupCodes', options.updateOnlyFields)) {
            await assignCustomerGroups(ctx, this.customerGroupService, customerId, record.groupCodes, this.logger);
        }

        this.logger.debug(`Updated customer ${record.emailAddress} (ID: ${customerId})`);
    }
}

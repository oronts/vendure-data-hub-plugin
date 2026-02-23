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
import { VendureEntityType } from '../../constants/enums';
import {
    BaseEntityLoader,
    ExistingEntityLookupResult,
    LoaderMetadata,
    ValidationBuilder,
    EntityLookupHelper,
    createLookupHelper,
} from '../base';
import {
    CustomerInput,
    CUSTOMER_LOADER_METADATA,
} from './types';
import {
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

    private readonly lookupHelper: EntityLookupHelper<CustomerService, Customer, CustomerInput>;

    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private customerGroupService: CustomerGroupService,
        private countryService: CountryService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CUSTOMER_LOADER);
        this.lookupHelper = createLookupHelper<CustomerService, Customer, CustomerInput>(this.customerService)
            .addFilterStrategy('emailAddress', 'emailAddress', (ctx, svc, opts) => svc.findAll(ctx, opts))
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id));
    }

    protected getDuplicateErrorMessage(record: CustomerInput): string {
        return `Customer with email "${record.emailAddress}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: CustomerInput,
    ): Promise<ExistingEntityLookupResult<Customer> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        _ctx: RequestContext,
        record: CustomerInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const builder = new ValidationBuilder()
            .requireEmailForCreate('emailAddress', record.emailAddress, operation)
            .requireStringForCreate('firstName', record.firstName, operation, 'First name is required')
            .requireStringForCreate('lastName', record.lastName, operation, 'Last name is required');

        // Validate addresses if provided
        if (record.addresses && Array.isArray(record.addresses)) {
            builder.validateArrayItems('addresses', record.addresses, (addr) => {
                const errors: { field: string; message: string; code?: string }[] = [];
                if (!addr.streetLine1) {
                    errors.push({ field: 'streetLine1', message: 'Street line 1 is required', code: 'REQUIRED' });
                }
                if (!addr.city) {
                    errors.push({ field: 'city', message: 'City is required', code: 'REQUIRED' });
                }
                if (!addr.countryCode) {
                    errors.push({ field: 'countryCode', message: 'Country code is required', code: 'REQUIRED' });
                }
                return errors;
            });
        }

        return builder.build();
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

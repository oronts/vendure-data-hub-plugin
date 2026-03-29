import { Injectable } from '@nestjs/common';
import {
    ID,
    CustomerGroup,
    RequestContext,
    CustomerGroupService,
    CustomerService,
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
    CustomerGroupInput,
    CUSTOMER_GROUP_LOADER_METADATA,
} from './types';
import {
    addCustomersToGroup,
    shouldUpdateField,
} from './helpers';
import { isValidEmail } from '../../utils/input-validation.utils';

/** Loads CustomerGroup entities via CustomerGroupService. Supports CREATE, UPDATE, UPSERT. */
@Injectable()
export class CustomerGroupLoader extends BaseEntityLoader<CustomerGroupInput, CustomerGroup> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = CUSTOMER_GROUP_LOADER_METADATA;

    private readonly lookupHelper: EntityLookupHelper<CustomerGroupService, CustomerGroup, CustomerGroupInput>;

    constructor(
        private customerGroupService: CustomerGroupService,
        private customerService: CustomerService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CUSTOMER_GROUP_LOADER);
        this.lookupHelper = createLookupHelper<CustomerGroupService, CustomerGroup, CustomerGroupInput>(this.customerGroupService)
            .addFilterStrategy('name', 'name', (ctx, svc, opts) => svc.findAll(ctx, opts))
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id));
    }

    protected getDuplicateErrorMessage(record: CustomerGroupInput): string {
        return `Customer group "${record.name}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: CustomerGroupInput,
    ): Promise<ExistingEntityLookupResult<CustomerGroup> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        _ctx: RequestContext,
        record: CustomerGroupInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const builder = new ValidationBuilder()
            .requireStringForCreate('name', record.name, operation, 'Customer group name is required');

        // Validate customer emails format if provided
        if (record.customerEmails && Array.isArray(record.customerEmails)) {
            for (let i = 0; i < record.customerEmails.length; i++) {
                if (!isValidEmail(record.customerEmails[i])) {
                    builder.addWarning(
                        `customerEmails[${i}]`,
                        `Invalid email format: ${record.customerEmails[i]}`,
                    );
                }
            }
        }

        return builder.build();
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.CUSTOMER_GROUP,
            fields: [
                {
                    key: 'name',
                    label: 'Group Name',
                    type: 'string',
                    required: true,
                    lookupable: true,
                    description: 'Unique name for the customer group',
                    example: 'VIP Customers',
                },
                {
                    key: 'customerEmails',
                    label: 'Customer Emails',
                    type: 'array',
                    description: 'Email addresses of customers to add to this group',
                    example: ['john@example.com', 'jane@example.com'],
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

    protected async createEntity(context: LoaderContext, record: CustomerGroupInput): Promise<ID | null> {
        const { ctx } = context;

        const group = await this.customerGroupService.create(ctx, {
            name: record.name,
            customFields: record.customFields as Record<string, unknown>,
        });

        if (record.customerEmails && record.customerEmails.length > 0) {
            await addCustomersToGroup(
                ctx,
                this.customerService,
                this.customerGroupService,
                group.id,
                record.customerEmails,
                this.logger,
            );
        }

        this.logger.log(`Created customer group ${record.name} (ID: ${group.id})`);
        return group.id;
    }

    protected async updateEntity(context: LoaderContext, groupId: ID, record: CustomerGroupInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: groupId };

        if (record.name !== undefined && shouldUpdateField('name', options.updateOnlyFields)) {
            updateInput.name = record.name;
        }
        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        await this.customerGroupService.update(ctx, updateInput as Parameters<typeof this.customerGroupService.update>[1]);

        if (record.customerEmails && shouldUpdateField('customerEmails', options.updateOnlyFields)) {
            await addCustomersToGroup(
                ctx,
                this.customerService,
                this.customerGroupService,
                groupId,
                record.customerEmails,
                this.logger,
            );
        }

        this.logger.debug(`Updated customer group ${record.name} (ID: ${groupId})`);
    }
}

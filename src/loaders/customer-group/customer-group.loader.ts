import { Injectable } from '@nestjs/common';
import {
    ID,
    CustomerGroup,
    RequestContext,
    TransactionalConnection,
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
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import { BaseEntityLoader, ExistingEntityLookupResult, LoaderMetadata } from '../base';
import {
    CustomerGroupInput,
    CUSTOMER_GROUP_LOADER_METADATA,
} from './types';
import {
    addCustomersToGroup,
    shouldUpdateField,
} from './helpers';
import { isValidEmail } from '../../utils/input-validation.utils';

/**
 * CustomerGroupLoader - Refactored to extend BaseEntityLoader
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
export class CustomerGroupLoader extends BaseEntityLoader<CustomerGroupInput, CustomerGroup> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = CUSTOMER_GROUP_LOADER_METADATA;

    constructor(
        private connection: TransactionalConnection,
        private customerGroupService: CustomerGroupService,
        private customerService: CustomerService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CUSTOMER_GROUP_LOADER);
    }

    protected getDuplicateErrorMessage(record: CustomerGroupInput): string {
        return `Customer group "${record.name}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: CustomerGroupInput,
    ): Promise<ExistingEntityLookupResult<CustomerGroup> | null> {
        // Primary lookup: by name
        if (record.name && lookupFields.includes('name')) {
            const groups = await this.customerGroupService.findAll(ctx, {
                filter: { name: { eq: record.name } },
            });
            if (groups.totalItems > 0) {
                return { id: groups.items[0].id, entity: groups.items[0] };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const group = await this.customerGroupService.findOne(ctx, record.id as ID);
            if (group) {
                return { id: group.id, entity: group };
            }
        }

        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: CustomerGroupInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                errors.push({ field: 'name', message: 'Customer group name is required', code: 'REQUIRED' });
            }
        }

        // Validate customer emails format if provided
        if (record.customerEmails && Array.isArray(record.customerEmails)) {
            for (let i = 0; i < record.customerEmails.length; i++) {
                if (!isValidEmail(record.customerEmails[i])) {
                    warnings.push({
                        field: `customerEmails[${i}]`,
                        message: `Invalid email format: ${record.customerEmails[i]}`,
                    });
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

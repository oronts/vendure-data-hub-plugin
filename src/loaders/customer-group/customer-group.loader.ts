import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    CustomerGroupService,
    CustomerService,
} from '@vendure/core';
import {
    EntityLoader,
    LoaderContext,
    EntityLoadResult,
    EntityValidationResult,
    EntityFieldSchema,
} from '../../types/index';
import { TargetOperation } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import {
    CustomerGroupInput,
    ExistingEntityResult,
    CUSTOMER_GROUP_LOADER_METADATA,
} from './types';
import {
    addCustomersToGroup,
    isRecoverableError,
    shouldUpdateField,
} from './helpers';

@Injectable()
export class CustomerGroupLoader implements EntityLoader<CustomerGroupInput> {
    private readonly logger: DataHubLogger;

    readonly entityType = CUSTOMER_GROUP_LOADER_METADATA.entityType;
    readonly name = CUSTOMER_GROUP_LOADER_METADATA.name;
    readonly description = CUSTOMER_GROUP_LOADER_METADATA.description;
    readonly supportedOperations: TargetOperation[] = [...CUSTOMER_GROUP_LOADER_METADATA.supportedOperations];
    readonly lookupFields = [...CUSTOMER_GROUP_LOADER_METADATA.lookupFields];
    readonly requiredFields = [...CUSTOMER_GROUP_LOADER_METADATA.requiredFields];

    constructor(
        private _connection: TransactionalConnection,
        private customerGroupService: CustomerGroupService,
        private customerService: CustomerService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CUSTOMER_GROUP_LOADER);
    }

    async load(context: LoaderContext, records: CustomerGroupInput[]): Promise<EntityLoadResult> {
        const result: EntityLoadResult = {
            succeeded: 0,
            failed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            affectedIds: [],
        };

        for (const record of records) {
            try {
                const validation = await this.validate(context.ctx, record, context.operation);
                if (!validation.valid) {
                    result.failed++;
                    result.errors.push({
                        record,
                        message: validation.errors.map(e => e.message).join('; '),
                        recoverable: false,
                    });
                    continue;
                }

                const existing = await this.findExisting(context.ctx, context.lookupFields, record);

                if (existing) {
                    if (context.operation === 'CREATE') {
                        if (context.options.skipDuplicates) {
                            result.skipped++;
                            continue;
                        }
                        result.failed++;
                        result.errors.push({
                            record,
                            message: `Customer group "${record.name}" already exists`,
                            code: 'DUPLICATE',
                            recoverable: false,
                        });
                        continue;
                    }

                    if (!context.dryRun) {
                        await this.updateCustomerGroup(context, existing.id, record);
                    }
                    result.updated++;
                    result.affectedIds.push(existing.id);
                } else {
                    if (context.operation === 'UPDATE') {
                        result.skipped++;
                        continue;
                    }

                    if (!context.dryRun) {
                        const newId = await this.createCustomerGroup(context, record);
                        result.affectedIds.push(newId);
                    }
                    result.created++;
                }

                result.succeeded++;
            } catch (error) {
                result.failed++;
                result.errors.push({
                    record,
                    message: error instanceof Error ? error.message : String(error),
                    recoverable: isRecoverableError(error),
                });
                this.logger.error(`Failed to load customer group`, error instanceof Error ? error : undefined);
            }
        }

        return result;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: CustomerGroupInput,
    ): Promise<ExistingEntityResult | null> {
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

        if (operation === 'CREATE' || operation === 'UPSERT') {
            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                errors.push({ field: 'name', message: 'Customer group name is required', code: 'REQUIRED' });
            }
        }

        // Validate customer emails format if provided
        if (record.customerEmails && Array.isArray(record.customerEmails)) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            for (let i = 0; i < record.customerEmails.length; i++) {
                if (!emailRegex.test(record.customerEmails[i])) {
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
            entityType: 'CustomerGroup',
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

    private async createCustomerGroup(context: LoaderContext, record: CustomerGroupInput): Promise<ID> {
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

    private async updateCustomerGroup(context: LoaderContext, groupId: ID, record: CustomerGroupInput): Promise<void> {
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

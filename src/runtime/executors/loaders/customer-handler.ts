/**
 * Customer upsert loader handler
 *
 * Type-safe implementation for creating/updating customers with addresses and groups.
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    CustomerService,
    CustomerGroupService,
    Customer,
    CustomerGroup,
    ID,
} from '@vendure/core';
import {
    CreateAddressInput,
    CustomerGroupListOptions,
    MutationAddCustomersToGroupArgs,
    MutationRemoveCustomersFromGroupArgs,
} from '@vendure/common/lib/generated-types';
import { ListQueryOptions } from '@vendure/core/dist/common/types/common-types';
import {
    PipelineStepDefinition,
    ErrorHandlingConfig,
    JsonObject,
} from '../../../types/index';
import type { CustomerUpsertLoaderConfig } from '../../../../shared/types';
import { LOGGER_CONTEXTS } from '../../../constants/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { toStringOrUndefined } from '../../utils';
import { LoaderHandler } from './types';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { getErrorMessage } from '../../../utils/error.utils';
import { getStringValue, getArrayValue } from '../../../loaders/shared-helpers';

/**
 * Configuration extracted from step.config for customer upsert operations.
 * Extends the shared CustomerUpsertLoaderConfig with normalized groupsMode values.
 */
interface CustomerStepConfig {
    emailField: string;
    firstNameField?: string;
    lastNameField?: string;
    phoneNumberField?: string;
    addressesField?: string;
    groupsField?: string;
    groupsMode?: 'add' | 'set';
}

/**
 * Address record structure from input data
 */
interface AddressRecord {
    streetLine1?: string;
    streetLine2?: string;
    address1?: string;  // Alternative naming from CSV imports
    address2?: string;  // Alternative naming from CSV imports
    city?: string;
    postalCode?: string;
    zip?: string;       // US-centric alternative naming
    countryCode?: string;
    phoneNumber?: string;
    province?: string;
    company?: string;
    fullName?: string;
    defaultShippingAddress?: boolean;
    defaultBillingAddress?: boolean;
}

/**
 * Input for customer create/update operations
 */
interface CustomerCreateOrUpdateInput {
    emailAddress: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
}

/**
 * Type guard to check if a value has the shape of CustomerUpsertLoaderConfig
 */
function hasCustomerLoaderConfigShape(config: unknown): config is Partial<CustomerUpsertLoaderConfig> {
    if (!config || typeof config !== 'object') {
        return false;
    }
    const cfg = config as Record<string, unknown>;
    // Check if it has the expected structure (adapterCode is optional in the extracted form)
    return (
        (cfg.emailField === undefined || typeof cfg.emailField === 'string') &&
        (cfg.firstNameField === undefined || typeof cfg.firstNameField === 'string') &&
        (cfg.lastNameField === undefined || typeof cfg.lastNameField === 'string') &&
        (cfg.phoneNumberField === undefined || typeof cfg.phoneNumberField === 'string') &&
        (cfg.addressesField === undefined || typeof cfg.addressesField === 'string') &&
        (cfg.groupsField === undefined || typeof cfg.groupsField === 'string') &&
        (cfg.groupsMode === undefined || typeof cfg.groupsMode === 'string')
    );
}

/**
 * Type guard to check if a value is an AddressRecord
 */
function isAddressRecord(value: unknown): value is AddressRecord {
    return value !== null && typeof value === 'object';
}

/**
 * Convert an address record to Vendure CreateAddressInput
 */
function toCreateAddressInput(addr: AddressRecord): CreateAddressInput {
    return {
        streetLine1: addr.streetLine1 ?? addr.address1 ?? '',
        streetLine2: addr.streetLine2 ?? addr.address2 ?? undefined,
        city: addr.city ?? undefined,
        postalCode: addr.postalCode ?? addr.zip ?? undefined,
        countryCode: addr.countryCode || 'US',
        phoneNumber: addr.phoneNumber ?? undefined,
        province: addr.province ?? undefined,
        company: addr.company ?? undefined,
        fullName: addr.fullName ?? undefined,
        defaultShippingAddress: addr.defaultShippingAddress ?? undefined,
        defaultBillingAddress: addr.defaultBillingAddress ?? undefined,
    };
}

@Injectable()
export class CustomerHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private customerService: CustomerService,
        private customerGroupService: CustomerGroupService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CUSTOMER_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;

        // Extract and validate config
        const config = this.extractConfig(step.config);

        for (const rec of input) {
            try {
                const email = getStringValue(rec, config.emailField ?? 'email');
                if (!email) {
                    fail++;
                    continue;
                }

                const firstName = toStringOrUndefined(getStringValue(rec, config.firstNameField ?? 'firstName'));
                const lastName = toStringOrUndefined(getStringValue(rec, config.lastNameField ?? 'lastName'));
                const phoneNumber = toStringOrUndefined(getStringValue(rec, config.phoneNumberField ?? 'phoneNumber'));

                const customerInput: CustomerCreateOrUpdateInput = {
                    emailAddress: email,
                    firstName: firstName ?? undefined,
                    lastName: lastName ?? undefined,
                    phoneNumber: phoneNumber ?? undefined,
                };

                const createdOrError = await this.customerService.createOrUpdate(ctx, customerInput);

                // createOrUpdate can return Customer or EmailAddressConflictError
                // Check if it's an error by looking for typical error properties
                if (this.isEmailConflictError(createdOrError)) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, createdOrError.message ?? 'Email conflict', rec);
                    }
                    continue;
                }

                const customer = createdOrError as Customer;

                // Merge addresses
                await this.processAddresses(ctx, step.key, rec, config, customer);

                // Process groups
                await this.processGroups(ctx, step.key, rec, config, customer);

                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'customerUpsert failed', rec);
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, unknown>> {
        let exists = 0, missing = 0;

        const config = this.extractConfig(step.config);

        for (const rec of input) {
            const email = getStringValue(rec, config.emailField ?? 'email');
            if (!email) continue;

            const listOptions: ListQueryOptions<Customer> = {
                filter: { emailAddress: { eq: email } },
                take: 1,
            };

            const list = await this.customerService.findAll(ctx, listOptions);
            if (list.items[0]) {
                exists++;
            } else {
                missing++;
            }
        }
        return { exists, missing };
    }

    /**
     * Extract typed config from step.config.
     * Validates the config shape and provides sensible defaults.
     */
    private extractConfig(stepConfig: JsonObject): CustomerStepConfig {
        if (hasCustomerLoaderConfigShape(stepConfig)) {
            return {
                emailField: (stepConfig.emailField as string | undefined) ?? 'email',
                firstNameField: stepConfig.firstNameField as string | undefined,
                lastNameField: stepConfig.lastNameField as string | undefined,
                phoneNumberField: stepConfig.phoneNumberField as string | undefined,
                addressesField: stepConfig.addressesField as string | undefined,
                groupsField: stepConfig.groupsField as string | undefined,
                groupsMode: stepConfig.groupsMode as CustomerStepConfig['groupsMode'],
            };
        }
        // Return defaults if config is invalid
        return {
            emailField: 'email',
            firstNameField: 'firstName',
            lastNameField: 'lastName',
            phoneNumberField: 'phoneNumber',
        };
    }

    /**
     * Check if the result is an EmailAddressConflictError
     */
    private isEmailConflictError(result: unknown): result is { message: string; errorCode?: string } {
        if (!result || typeof result !== 'object') {
            return false;
        }
        const obj = result as Record<string, unknown>;
        return (
            typeof obj.message === 'string' ||
            obj.errorCode === 'EMAIL_ADDRESS_CONFLICT_ERROR'
        );
    }

    /**
     * Process addresses for a customer
     */
    private async processAddresses(
        ctx: RequestContext,
        stepKey: string,
        rec: RecordObject,
        config: CustomerStepConfig,
        customer: Customer,
    ): Promise<void> {
        const addressesField = config.addressesField;
        if (!addressesField) {
            return;
        }

        const addresses = getArrayValue<unknown>(rec, addressesField);
        if (!addresses) {
            return;
        }

        for (const addr of addresses) {
            if (!isAddressRecord(addr)) {
                continue;
            }

            try {
                // Address field fallbacks support common import naming conventions:
                // - streetLine1/streetLine2: Vendure standard fields
                // - address1/address2: Common alternative naming in CSV imports
                // - postalCode/zip: Vendure standard vs US-centric naming
                const addressInput = toCreateAddressInput(addr);
                await this.customerService.createAddress(ctx, customer.id, addressInput);
            } catch (error) {
                this.logger.warn('Failed to create customer address', {
                    stepKey,
                    customerId: customer.id,
                    addressCity: addr.city,
                    error: getErrorMessage(error),
                });
            }
        }
    }

    /**
     * Process customer groups
     */
    private async processGroups(
        ctx: RequestContext,
        stepKey: string,
        rec: RecordObject,
        config: CustomerStepConfig,
        customer: Customer,
    ): Promise<void> {
        const groupsField = config.groupsField;
        if (!groupsField) {
            return;
        }

        const codes = getArrayValue<string>(rec, groupsField);
        if (!codes) {
            return;
        }

        const existingGroups = await this.customerService.getCustomerGroups(ctx, customer.id);
        const existingGroupNames = existingGroups.map(g => g.name);

        // Add to new groups
        const toAddCodes = codes.filter(c => !existingGroupNames.includes(c));

        if (toAddCodes.length > 0) {
            for (const groupName of toAddCodes) {
                await this.addCustomerToGroup(ctx, stepKey, customer.id, groupName);
            }
        }

        // Handle 'set' mode - remove from groups not in the list
        const groupsMode = this.normalizeGroupsMode(config.groupsMode);
        if (groupsMode === 'set') {
            const toRemove = existingGroups.filter(g => !codes.includes(g.name));
            for (const group of toRemove) {
                await this.removeCustomerFromGroup(ctx, stepKey, customer.id, group);
            }
        }
    }

    /**
     * Normalize groups mode to internal representation
     */
    private normalizeGroupsMode(mode?: string): 'set' | 'add' {
        if (!mode) {
            return 'add';
        }
        const normalized = mode.toLowerCase();
        if (normalized === 'set' || normalized === 'replace') {
            return 'set';
        }
        return 'add';
    }

    /**
     * Add customer to a group by name
     */
    private async addCustomerToGroup(
        ctx: RequestContext,
        stepKey: string,
        customerId: ID,
        groupName: string,
    ): Promise<void> {
        try {
            const listOptions: CustomerGroupListOptions = {
                filter: { name: { eq: groupName } },
                take: 1,
            };

            const list = await this.customerGroupService.findAll(ctx, listOptions);
            const group = list.items[0];

            if (group?.id) {
                const addArgs: MutationAddCustomersToGroupArgs = {
                    customerGroupId: group.id,
                    customerIds: [customerId],
                };
                await this.customerGroupService.addCustomersToGroup(ctx, addArgs);
            }
        } catch (error) {
            this.logger.warn('Failed to add customer to group', {
                stepKey,
                customerId,
                groupName,
                error: getErrorMessage(error),
            });
        }
    }

    /**
     * Remove customer from a group
     */
    private async removeCustomerFromGroup(
        ctx: RequestContext,
        stepKey: string,
        customerId: ID,
        group: CustomerGroup,
    ): Promise<void> {
        try {
            const removeArgs: MutationRemoveCustomersFromGroupArgs = {
                customerGroupId: group.id,
                customerIds: [customerId],
            };
            await this.customerGroupService.removeCustomersFromGroup(ctx, removeArgs);
        } catch (error) {
            this.logger.warn('Failed to remove customer from group', {
                stepKey,
                customerId,
                groupId: group.id,
                error: getErrorMessage(error),
            });
        }
    }
}

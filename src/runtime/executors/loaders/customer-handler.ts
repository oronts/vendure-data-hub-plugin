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
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { assertCreateDuplicateCanBeSkipped, CreateDuplicateHandlingConfig } from './duplicate-handling';
import { LoadStrategy } from '../../../constants/enums';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { getStringValue, getArrayValue, getObjectValue } from '../../../loaders/shared-helpers';

/**
 * Configuration extracted from step.config for customer upsert operations.
 * Extends the shared CustomerUpsertLoaderConfig with normalized groupsMode values.
 */
interface CustomerStepConfig extends CreateDuplicateHandlingConfig {
    emailField: string;
    firstNameField?: string;
    lastNameField?: string;
    phoneNumberField?: string;
    addressesField?: string;
    addressesMode?: string;
    addressMatchFields?: string;
    groupsField?: string;
    groupsMode?: string;
    customFieldsField?: string;
    strategy?: LoadStrategy;
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
    customFields?: Record<string, unknown>;
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
        (cfg.groupsMode === undefined || typeof cfg.groupsMode === 'string') &&
        (cfg.customFieldsField === undefined || typeof cfg.customFieldsField === 'string') &&
        (cfg.skipDuplicates === undefined || typeof cfg.skipDuplicates === 'boolean')
    );
}

/**
 * Type guard to check if a value is an AddressRecord
 */
function isAddressRecord(value: unknown): value is AddressRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Convert an address record to Vendure CreateAddressInput
 */
function toCreateAddressInput(addr: AddressRecord): CreateAddressInput {
    const streetLine1 = (addr.streetLine1 ?? addr.address1 ?? '').trim();
    const countryCode = (addr.countryCode ?? '').trim().toUpperCase();
    if (!streetLine1 || !countryCode) {
        throw new Error('Customer addresses require streetLine1 and countryCode');
    }
    return {
        streetLine1,
        streetLine2: addr.streetLine2 ?? addr.address2,
        city: addr.city,
        postalCode: addr.postalCode ?? addr.zip,
        countryCode,
        phoneNumber: addr.phoneNumber,
        province: addr.province,
        company: addr.company,
        fullName: addr.fullName,
        defaultShippingAddress: addr.defaultShippingAddress,
        defaultBillingAddress: addr.defaultBillingAddress,
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
    ): Promise<LoaderExecutionResult> {
        let ok = 0, fail = 0, skipped = 0;

        // Extract and validate config
        const config = this.extractConfig(step.config);

        const strategy = config.strategy ?? LoadStrategy.UPSERT;

        for (const rec of input) {
            try {
                const email = getStringValue(rec, config.emailField ?? 'email');
                if (!email) {
                    if (onRecordError) {
                        await onRecordError(step.key, `Missing required email field "${config.emailField ?? 'email'}"`, rec);
                    }
                    fail++;
                    continue;
                }

                // Strategy check: look up existing customer by email
                if (strategy !== LoadStrategy.UPSERT) {
                    const listOptions: ListQueryOptions<Customer> = {
                        filter: { emailAddress: { eq: email } },
                        take: 1,
                    };
                    const list = await this.customerService.findAll(ctx, listOptions);
                    const exists = list.items.length > 0;

                    if (exists && strategy === LoadStrategy.CREATE) {
                        assertCreateDuplicateCanBeSkipped(config, 'customer', email);
                        skipped++;
                        continue;
                    }
                    if (!exists && strategy === LoadStrategy.UPDATE) {
                        fail++;
                        if (onRecordError) {
                            await onRecordError(step.key, `Customer not found for update: ${email}`, rec);
                        }
                        continue;
                    }
                }

                const firstName = getStringValue(rec, config.firstNameField ?? 'firstName');
                const lastName = getStringValue(rec, config.lastNameField ?? 'lastName');
                const phoneNumber = getStringValue(rec, config.phoneNumberField ?? 'phoneNumber');

                const customFieldsKey = config.customFieldsField ?? 'customFields';
                const customFields = getObjectValue(rec, customFieldsKey);

                const customerInput: CustomerCreateOrUpdateInput = {
                    emailAddress: email,
                    firstName,
                    lastName,
                    phoneNumber,
                };
                if (customFields) {
                    customerInput.customFields = customFields;
                }

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
                await this.processAddresses(ctx, rec, config, customer);

                // Process groups
                await this.processGroups(ctx, step.key, rec, config, customer);

                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'customerUpsert failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail, skipped };
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
            const cfg = stepConfig as Record<string, unknown>;
            return {
                emailField: (stepConfig.emailField as string | undefined) ?? 'email',
                firstNameField: stepConfig.firstNameField as string | undefined,
                lastNameField: stepConfig.lastNameField as string | undefined,
                phoneNumberField: stepConfig.phoneNumberField as string | undefined,
                addressesField: stepConfig.addressesField as string | undefined,
                addressesMode: (stepConfig as Record<string, unknown>).addressesMode as string | undefined,
                addressMatchFields: (stepConfig as Record<string, unknown>).addressMatchFields as string | undefined,
                groupsField: stepConfig.groupsField as string | undefined,
                groupsMode: stepConfig.groupsMode as CustomerStepConfig['groupsMode'],
                customFieldsField: stepConfig.customFieldsField as string | undefined,
                strategy: cfg.strategy as LoadStrategy | undefined,
                skipDuplicates: cfg.skipDuplicates as boolean | undefined,
            };
        }
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
        return obj.errorCode === 'EMAIL_ADDRESS_CONFLICT_ERROR';
    }

    /**
     * Process addresses for a customer.
     * Supports addressesMode: APPEND_ONLY (default), UPSERT_BY_MATCH, REPLACE_ALL, SKIP.
     */
    private async processAddresses(
        ctx: RequestContext,
        rec: RecordObject,
        config: CustomerStepConfig,
        customer: Customer,
    ): Promise<void> {
        if (!config.addressesField) {
            return;
        }

        const addresses = getArrayValue<unknown>(rec, config.addressesField);
        if (!addresses || config.addressesMode === 'SKIP') {
            return;
        }
        const addressInputs = addresses.map((address, index) => {
            if (!isAddressRecord(address)) {
                throw new Error(`Customer address at index ${index} must be an object`);
            }
            return toCreateAddressInput(address);
        });
        const mode = config.addressesMode ?? 'UPSERT_BY_MATCH';

        if (mode === 'APPEND_ONLY') {
            for (const input of addressInputs) {
                await this.customerService.createAddress(ctx, customer.id, input);
            }
            return;
        }

        const customerWithAddresses = await this.customerService.findOne(
            ctx,
            customer.id,
            ['addresses', 'addresses.country'],
        );
        if (!customerWithAddresses) {
            throw new Error(`Customer "${String(customer.id)}" not found while processing addresses`);
        }
        const existingAddresses = customerWithAddresses.addresses ?? [];

        if (mode === 'REPLACE_ALL') {
            for (const input of addressInputs) {
                await this.customerService.createAddress(ctx, customer.id, input);
            }
            for (const existing of existingAddresses) {
                await this.customerService.deleteAddress(ctx, existing.id);
            }
            return;
        }

        if (mode !== 'UPSERT_BY_MATCH') {
            throw new Error(`Unsupported customer address mode "${mode}"`);
        }

        const matchFields = (config.addressMatchFields ?? 'streetLine1,city,countryCode')
            .split(',')
            .map(field => field.trim())
            .filter(Boolean);
        if (matchFields.length === 0) {
            throw new Error('Customer address matching requires at least one match field');
        }

        for (const input of addressInputs) {
            const match = existingAddresses.find(existing =>
                matchFields.every(field => {
                    const existingValue = this.getAddressFieldValue(
                        existing as unknown as Record<string, unknown>,
                        field,
                    );
                    const newValue = this.getAddressFieldValue(
                        input as unknown as Record<string, unknown>,
                        field,
                    );
                    return existingValue !== undefined &&
                        newValue !== undefined &&
                        String(existingValue).trim().toLowerCase() ===
                            String(newValue).trim().toLowerCase();
                }),
            );

            if (match) {
                await this.customerService.updateAddress(ctx, { id: match.id, ...input });
            } else {
                await this.customerService.createAddress(ctx, customer.id, input);
            }
        }
    }

    /**
     * Get a field value from an address, handling the country relation object.
     */
    private getAddressFieldValue(addr: Record<string, unknown>, field: string): unknown {
        if (field === 'countryCode') {
            // Handle both Vendure Address entity (country.code) and CreateAddressInput (countryCode)
            const country = addr.country;
            if (country && typeof country === 'object' && 'code' in country) {
                return (country as Record<string, unknown>).code;
            }
            return addr.countryCode;
        }
        return addr[field];
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

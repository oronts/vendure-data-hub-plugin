import { Injectable } from '@nestjs/common';
import {
    Customer,
    CustomerGroupService,
    CustomerService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import type {
    AddressesMode,
    CustomerUpsertLoaderConfig,
    GroupsMode,
} from '../../../../shared/types';
import { LoadStrategy } from '../../../constants/enums';
import { getObjectValue, getStringValue } from '../../../loaders/shared-helpers';
import type {
    ErrorHandlingConfig,
    JsonObject,
    PipelineStepDefinition,
} from '../../../types';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import type {
    LoaderExecutionResult,
    OnRecordErrorCallback,
    RecordObject,
} from '../../executor-types';
import {
    applyCustomerAddresses,
    prepareCustomerAddresses,
} from './customer-addresses';
import {
    applyCustomerGroups,
    prepareCustomerGroupNames,
} from './customer-groups';
import {
    assertCreateDuplicateCanBeSkipped,
    type CreateDuplicateHandlingConfig,
} from './duplicate-handling';
import {
    createUpsertSimulationDetail,
    summarizeSimulationDetails,
} from './loader-simulation';
import type { LoaderHandler, LoaderSimulationResult } from './types';
import {
    parseOptionalBoolean,
    parseUpsertStrategy,
} from './loader-config.validation';

interface CustomerStepConfig extends CreateDuplicateHandlingConfig {
    emailField: string;
    firstNameField?: string;
    lastNameField?: string;
    phoneNumberField?: string;
    addressesField?: string;
    addressesMode?: AddressesMode;
    addressMatchFields?: string;
    groupsField?: string;
    groupsMode?: GroupsMode;
    customFieldsField?: string;
    strategy?: LoadStrategy;
}

type CustomerMutationResult = 'ok' | 'skipped';

function parseGroupsMode(value: unknown): GroupsMode | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (value !== 'ADD' && value !== 'SET') {
        throw new Error(`Unsupported customer groups mode "${String(value)}"`);
    }
    return value;
}

function extractConfig(config: JsonObject): CustomerStepConfig {
    const source = config as Partial<CustomerUpsertLoaderConfig>;
    return {
        emailField: typeof source.emailField === 'string' ? source.emailField : 'email',
        firstNameField: typeof source.firstNameField === 'string' ? source.firstNameField : undefined,
        lastNameField: typeof source.lastNameField === 'string' ? source.lastNameField : undefined,
        phoneNumberField: typeof source.phoneNumberField === 'string'
            ? source.phoneNumberField
            : undefined,
        addressesField: typeof source.addressesField === 'string' ? source.addressesField : undefined,
        addressesMode: source.addressesMode,
        addressMatchFields: typeof source.addressMatchFields === 'string'
            ? source.addressMatchFields
            : undefined,
        groupsField: typeof source.groupsField === 'string' ? source.groupsField : undefined,
        groupsMode: parseGroupsMode(source.groupsMode),
        customFieldsField: typeof source.customFieldsField === 'string'
            ? source.customFieldsField
            : undefined,
        strategy: parseUpsertStrategy(source.strategy),
        skipDuplicates: parseOptionalBoolean(source.skipDuplicates, 'skipDuplicates'),
    };
}

function isEmailConflictError(
    value: unknown,
): value is { message: string; errorCode: 'EMAIL_ADDRESS_CONFLICT_ERROR' } {
    return Boolean(
        value
        && typeof value === 'object'
        && Reflect.get(value, 'errorCode') === 'EMAIL_ADDRESS_CONFLICT_ERROR',
    );
}

@Injectable()
export class CustomerHandler implements LoaderHandler {
    constructor(
        private readonly customerService: CustomerService,
        private readonly customerGroupService: CustomerGroupService,
        private readonly connection: TransactionalConnection,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        let ok = 0;
        let fail = 0;
        let skipped = 0;
        const config = extractConfig(step.config);

        for (const record of input) {
            try {
                const result = await this.connection.withTransaction(
                    ctx,
                    transactionCtx => this.upsertRecord(transactionCtx, record, config),
                );
                if (result === 'skipped') {
                    skipped++;
                } else {
                    ok++;
                }
            } catch (error) {
                await onRecordError?.(
                    step.key,
                    getErrorMessage(error) || 'customerUpsert failed',
                    record,
                    getErrorStack(error),
                );
                fail++;
            }
        }
        return { ok, fail, skipped };
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<LoaderSimulationResult> {
        const config = extractConfig(step.config);
        const recordDetails = [];

        for (let index = 0; index < input.length; index++) {
            const record = input[index];
            const email = getStringValue(record, config.emailField);
            const existing = email
                ? (await this.findByEmail(ctx, email))
                : undefined;
            recordDetails.push(createUpsertSimulationDetail({
                record,
                index,
                entityType: 'Customer',
                existing,
                strategy: config.strategy,
                skipDuplicates: config.skipDuplicates,
                identifier: email,
                missingIdentifier: email
                    ? undefined
                    : `Missing required email field "${config.emailField}"`,
            }));
        }

        return {
            supported: true,
            recordsIn: input.length,
            recordDetails,
            ...summarizeSimulationDetails(recordDetails),
        };
    }

    private async upsertRecord(
        ctx: RequestContext,
        record: RecordObject,
        config: CustomerStepConfig,
    ): Promise<CustomerMutationResult> {
        const email = getStringValue(record, config.emailField);
        if (!email) {
            throw new Error(`Missing required email field "${config.emailField}"`);
        }

        const preparedAddresses = prepareCustomerAddresses(record, config);
        const groupNames = prepareCustomerGroupNames(record, config);
        const existing = await this.findByEmail(ctx, email);
        const strategy = config.strategy ?? LoadStrategy.UPSERT;
        if (existing && strategy === LoadStrategy.CREATE) {
            assertCreateDuplicateCanBeSkipped(config, 'customer', email);
            return 'skipped';
        }
        if (!existing && strategy === LoadStrategy.UPDATE) {
            throw new Error(`Customer not found for update: ${email}`);
        }

        const customFields = getObjectValue(
            record,
            config.customFieldsField ?? 'customFields',
        );
        const result = await this.customerService.createOrUpdate(ctx, {
            emailAddress: email,
            firstName: getStringValue(record, config.firstNameField ?? 'firstName'),
            lastName: getStringValue(record, config.lastNameField ?? 'lastName'),
            phoneNumber: getStringValue(record, config.phoneNumberField ?? 'phoneNumber'),
            ...(customFields ? { customFields } : {}),
        });
        if (isEmailConflictError(result)) {
            throw new Error(result.message || 'Email conflict');
        }

        const customer = result as Customer;
        await applyCustomerAddresses(
            this.customerService,
            ctx,
            customer.id,
            preparedAddresses,
        );
        await applyCustomerGroups(
            this.customerService,
            this.customerGroupService,
            ctx,
            customer,
            groupNames,
            config.groupsMode,
        );
        return 'ok';
    }

    private async findByEmail(
        ctx: RequestContext,
        emailAddress: string,
    ): Promise<Customer | undefined> {
        return (await this.customerService.findAll(ctx, {
            filter: { emailAddress: { eq: emailAddress } },
            take: 1,
        })).items[0];
    }
}

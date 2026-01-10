/**
 * Customer upsert loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    CustomerService,
    CustomerGroupService,
} from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { strOrUndefined } from '../../utils';
import { LoaderHandler } from './types';
import { LOGGER_CONTEXTS } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';

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
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;

        for (const rec of input) {
            try {
                const email = String((rec as any)?.[(step.config as any)?.emailField ?? 'email'] ?? '') || undefined;
                if (!email) { fail++; continue; }

                const firstName = strOrUndefined((rec as any)?.[(step.config as any)?.firstNameField ?? 'firstName']);
                const lastName = strOrUndefined((rec as any)?.[(step.config as any)?.lastNameField ?? 'lastName']);
                const phoneNumber = strOrUndefined((rec as any)?.[(step.config as any)?.phoneNumberField ?? 'phoneNumber']);
                const addressesField = (step.config as any)?.addressesField as string | undefined;
                const groupsField = (step.config as any)?.groupsField as string | undefined;

                const createdOr = await this.customerService.createOrUpdate(ctx, {
                    emailAddress: email,
                    firstName: firstName ?? undefined,
                    lastName: lastName ?? undefined,
                    phoneNumber: phoneNumber ?? undefined,
                } as any);
                const customer = createdOr as any;

                // Merge addresses
                if (addressesField && Array.isArray((rec as any)?.[addressesField])) {
                    const addrs = (rec as any)[addressesField] as Array<any>;
                    for (const a of addrs) {
                        try {
                            // Address field fallbacks support common import naming conventions:
                            // - streetLine1/streetLine2: Vendure standard fields
                            // - address1/address2: Common alternative naming in CSV imports
                            // - postalCode/zip: Vendure standard vs US-centric naming
                            await this.customerService.createAddress(ctx, customer.id, {
                                streetLine1: a.streetLine1 ?? a.address1 ?? '',
                                streetLine2: a.streetLine2 ?? a.address2 ?? undefined,
                                city: a.city ?? '',
                                postalCode: a.postalCode ?? a.zip ?? undefined,
                                countryCode: a.countryCode || 'US',
                                phoneNumber: a.phoneNumber ?? undefined,
                            } as any);
                        } catch (error) {
                            this.logger.warn('Failed to create customer address', {
                                stepKey: step.key,
                                customerId: customer.id,
                                addressCity: a.city,
                                error: (error as Error)?.message,
                            });
                        }
                    }
                }

                // Groups
                if (groupsField && Array.isArray((rec as any)?.[groupsField])) {
                    const codes = (rec as any)[groupsField] as string[];
                    const existingGroups = await this.customerService.getCustomerGroups(ctx, customer.id);
                    const toAddCodes = codes.filter(c => !existingGroups.some(g => (g as any).code === c));

                    if (toAddCodes.length) {
                        for (const code of toAddCodes) {
                            try {
                                const list = await this.customerGroupService.findAll(ctx, { filter: { code: { eq: code } }, take: 1 } as any);
                                const group = list.items[0] as any;
                                if (group?.id) {
                                    await this.customerGroupService.addCustomersToGroup(ctx, { customerGroupId: group.id, customerIds: [customer.id] } as any);
                                }
                            } catch (error) {
                                this.logger.warn('Failed to add customer to group', {
                                    stepKey: step.key,
                                    customerId: customer.id,
                                    groupCode: code,
                                    error: (error as Error)?.message,
                                });
                            }
                        }
                    }

                    const groupsMode = ((step.config as any)?.groupsMode as string | undefined) ?? 'add';
                    if (groupsMode === 'set') {
                        const toRemove = existingGroups.filter(g => !codes.includes((g as any).code));
                        for (const g of toRemove) {
                            try {
                                await this.customerGroupService.removeCustomersFromGroup(ctx, { customerGroupId: (g as any).id, customerIds: [customer.id] } as any);
                            } catch (error) {
                                this.logger.warn('Failed to remove customer from group', {
                                    stepKey: step.key,
                                    customerId: customer.id,
                                    groupId: (g as any).id,
                                    error: (error as Error)?.message,
                                });
                            }
                        }
                    }
                }
                ok++;
            } catch (e: any) {
                if (onRecordError) {
                    await onRecordError(step.key, e?.message ?? 'customerUpsert failed', rec as any);
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
    ): Promise<Record<string, any>> {
        let exists = 0, missing = 0;
        for (const rec of input) {
            const email = String((rec as any)?.[(step.config as any)?.emailField ?? 'email'] ?? '') || undefined;
            if (!email) continue;
            const list = await this.customerService.findAll(ctx, { filter: { emailAddress: { eq: email } }, take: 1 } as any);
            if (list.items[0]) exists++; else missing++;
        }
        return { exists, missing };
    }
}

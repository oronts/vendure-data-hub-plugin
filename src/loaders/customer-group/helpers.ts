import { ID, RequestContext, CustomerService, CustomerGroupService } from '@vendure/core';
import { DataHubLogger } from '../../services/logger';

export async function addCustomersToGroup(
    ctx: RequestContext,
    customerService: CustomerService,
    customerGroupService: CustomerGroupService,
    groupId: ID,
    emails: string[],
    logger: DataHubLogger,
): Promise<void> {
    const customerIds: ID[] = [];

    for (const email of emails) {
        const customers = await customerService.findAll(ctx, {
            filter: { emailAddress: { eq: email } },
        });
        if (customers.totalItems > 0) {
            customerIds.push(customers.items[0].id);
        } else {
            logger.warn(`Customer with email "${email}" not found`);
        }
    }

    if (customerIds.length > 0) {
        await customerGroupService.addCustomersToGroup(ctx, {
            customerGroupId: groupId,
            customerIds,
        });
    }
}

export function isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('connection') ||
            message.includes('temporarily')
        );
    }
    return false;
}

export function shouldUpdateField(
    field: string,
    updateOnlyFields?: string[],
): boolean {
    if (!updateOnlyFields || updateOnlyFields.length === 0) {
        return true;
    }
    return updateOnlyFields.includes(field);
}

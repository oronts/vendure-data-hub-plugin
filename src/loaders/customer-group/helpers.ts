import { ID, RequestContext, CustomerService, CustomerGroupService } from '@vendure/core';
import { DataHubLogger } from '../../services/logger';

export { isRecoverableError, shouldUpdateField } from '../shared-helpers';

/**
 * Adds customers to a group by their email addresses.
 *
 * Note: Queries customers individually by email because Vendure's
 * CustomerService.findAll filter doesn't support 'in' operator for multiple emails.
 * For large batches, consider chunking the emails to reduce database load.
 *
 * @param ctx - RequestContext
 * @param customerService - CustomerService instance
 * @param customerGroupService - CustomerGroupService instance
 * @param groupId - Target customer group ID
 * @param emails - Array of customer email addresses
 * @param logger - Logger instance
 */
export async function addCustomersToGroup(
    ctx: RequestContext,
    customerService: CustomerService,
    customerGroupService: CustomerGroupService,
    groupId: ID,
    emails: string[],
    logger: DataHubLogger,
): Promise<void> {
    if (!emails || emails.length === 0) {
        return;
    }

    const customerIds: ID[] = [];
    const notFoundEmails: string[] = [];

    // Query customers - individual queries are necessary as Vendure doesn't support
    // bulk email lookup. For large imports, this could be optimized with raw SQL.
    for (const email of emails) {
        const customers = await customerService.findAll(ctx, {
            filter: { emailAddress: { eq: email } },
        });
        if (customers.totalItems > 0) {
            customerIds.push(customers.items[0].id);
        } else {
            notFoundEmails.push(email);
        }
    }

    // Log all not-found emails at once to reduce log spam
    if (notFoundEmails.length > 0) {
        logger.warn(`Customers not found for emails: ${notFoundEmails.join(', ')}`);
    }

    if (customerIds.length > 0) {
        await customerGroupService.addCustomersToGroup(ctx, {
            customerGroupId: groupId,
            customerIds,
        });
    }
}


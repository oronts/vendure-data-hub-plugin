import type {
    Customer,
    CustomerGroupService,
    CustomerService,
    ID,
    RequestContext,
} from '@vendure/core';
import type { GroupsMode } from '../../../../shared/types';
import { getArrayValue } from '../../../loaders/shared-helpers';
import type { RecordObject } from '../../executor-types';

export interface CustomerGroupConfig {
    groupsField?: string;
    groupsMode?: GroupsMode;
}

export function prepareCustomerGroupNames(
    record: RecordObject,
    config: CustomerGroupConfig,
): string[] | undefined {
    if (!config.groupsField) {
        return undefined;
    }
    const values = getArrayValue<unknown>(record, config.groupsField);
    if (!values) {
        return undefined;
    }

    const names = values.map((value, index) => {
        if (typeof value !== 'string' || !value.trim()) {
            throw new Error(`Customer group at index ${index} must be a non-empty name`);
        }
        return value.trim();
    });
    return [...new Map(names.map(name => [name.toLowerCase(), name])).values()];
}

export async function applyCustomerGroups(
    customerService: CustomerService,
    customerGroupService: CustomerGroupService,
    ctx: RequestContext,
    customer: Customer,
    requestedNames: string[] | undefined,
    mode: GroupsMode = 'ADD',
): Promise<void> {
    if (!requestedNames) {
        return;
    }

    const existingGroups = await customerService.getCustomerGroups(ctx, customer.id);
    const existingNames = new Set(existingGroups.map(group => group.name.toLowerCase()));
    const requested = new Set(requestedNames.map(name => name.toLowerCase()));

    for (const groupName of requestedNames) {
        if (!existingNames.has(groupName.toLowerCase())) {
            await addCustomerToGroup(customerGroupService, ctx, customer.id, groupName);
        }
    }

    if (mode === 'SET') {
        for (const group of existingGroups) {
            if (!requested.has(group.name.toLowerCase())) {
                await customerGroupService.removeCustomersFromGroup(ctx, {
                    customerGroupId: group.id,
                    customerIds: [customer.id],
                });
            }
        }
    }
}

async function addCustomerToGroup(
    customerGroupService: CustomerGroupService,
    ctx: RequestContext,
    customerId: ID,
    groupName: string,
): Promise<void> {
    const groups = await customerGroupService.findAll(ctx, {
        filter: { name: { eq: groupName } },
        take: 2,
    });
    if (groups.items.length === 0) {
        throw new Error(`Customer group not found: ${groupName}`);
    }
    if (groups.items.length > 1) {
        throw new Error(`Multiple customer groups use name "${groupName}"`);
    }
    await customerGroupService.addCustomersToGroup(ctx, {
        customerGroupId: groups.items[0].id,
        customerIds: [customerId],
    });
}

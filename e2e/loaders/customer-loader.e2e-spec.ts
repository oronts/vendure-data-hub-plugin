/**
 * Customer loader handler e2e tests
 *
 * Tests CustomerHandler.execute() directly against a real Vendure server.
 * Covers: create, update, upsert, addresses, groups, groupsMode, and error handling.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CustomerService, CustomerGroupService } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { CustomerHandler } from '../../src/runtime/executors/loaders/customer-handler';
import { CustomerGroupHandler } from '../../src/runtime/executors/loaders/customer-group-handler';
import { getSuperadminContext, makeStep, createErrorCollector, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';
import type { ListQueryOptions } from '@vendure/core/dist/common/types/common-types';

describe('CustomerHandler e2e', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let customerHandler: CustomerHandler;
    let groupHandler: CustomerGroupHandler;
    let customerService: CustomerService;
    let groupService: CustomerGroupService;
    let ctx: import('@vendure/core').RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        customerHandler = server.app.get(CustomerHandler);
        groupHandler = server.app.get(CustomerGroupHandler);
        customerService = server.app.get(CustomerService);
        groupService = server.app.get(CustomerGroupService);
        ctx = await getSuperadminContext(server.app);

        // Create customer groups for group assignment tests
        const groupStep = makeStep('setup-groups', {
            strategy: 'UPSERT',
            nameField: 'name',
        });
        await groupHandler.execute(ctx, groupStep, [
            { name: 'B2B' },
            { name: 'Premium' },
            { name: 'Retail' },
        ]);
    });

    afterAll(async () => {
        await server.destroy();
    });

    it('creates a new customer via upsert', async () => {
        const step = makeStep('test-customer-create', {
            strategy: 'UPSERT',
            emailField: 'email',
            firstNameField: 'firstName',
            lastNameField: 'lastName',
        });
        const input = [{
            email: 'max@labtech.de',
            firstName: 'Max',
            lastName: 'Mustermann',
        }];

        const result = await customerHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);
        expect(result.fail).toBe(0);

        // Verify customer exists
        const list = await customerService.findAll(ctx, {
            filter: { emailAddress: { eq: 'max@labtech.de' } },
        } as ListQueryOptions<import('@vendure/core').Customer>);
        expect(list.items.length).toBe(1);
        expect(list.items[0].firstName).toBe('Max');
        expect(list.items[0].lastName).toBe('Mustermann');
    });

    it('updates existing customer via upsert (idempotent)', async () => {
        const step = makeStep('test-customer-update', {
            strategy: 'UPSERT',
            emailField: 'email',
            firstNameField: 'firstName',
            lastNameField: 'lastName',
            phoneNumberField: 'phone',
        });
        const input = [{
            email: 'max@labtech.de',
            firstName: 'Maximilian',
            lastName: 'Mustermann',
            phone: '+49 30 12345',
        }];

        const result = await customerHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        const list = await customerService.findAll(ctx, {
            filter: { emailAddress: { eq: 'max@labtech.de' } },
        } as ListQueryOptions<import('@vendure/core').Customer>);
        expect(list.items[0].firstName).toBe('Maximilian');
        expect(list.items[0].phoneNumber).toBe('+49 30 12345');
    });

    it('creates customer with addresses', async () => {
        const step = makeStep('test-customer-addresses', {
            strategy: 'UPSERT',
            emailField: 'email',
            firstNameField: 'firstName',
            lastNameField: 'lastName',
            addressesField: 'addresses',
        });
        const input = [{
            email: 'sarah@uniklinik.de',
            firstName: 'Sarah',
            lastName: 'Schmidt',
            addresses: [
                {
                    streetLine1: 'Klinikweg 7',
                    city: 'Munich',
                    postalCode: '80333',
                    countryCode: 'DE',
                    defaultShippingAddress: true,
                    defaultBillingAddress: true,
                },
            ],
        }];

        const result = await customerHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        const list = await customerService.findAll(ctx, {
            filter: { emailAddress: { eq: 'sarah@uniklinik.de' } },
        } as ListQueryOptions<import('@vendure/core').Customer>);
        expect(list.items.length).toBe(1);
    });

    it('assigns customer to groups', async () => {
        const step = makeStep('test-customer-groups', {
            strategy: 'UPSERT',
            emailField: 'email',
            firstNameField: 'firstName',
            lastNameField: 'lastName',
            groupsField: 'groups',
            groupsMode: 'add',
        });
        const input = [{
            email: 'max@labtech.de',
            firstName: 'Maximilian',
            lastName: 'Mustermann',
            groups: ['B2B', 'Premium'],
        }];

        const result = await customerHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        // Verify group membership
        const list = await customerService.findAll(ctx, {
            filter: { emailAddress: { eq: 'max@labtech.de' } },
        } as ListQueryOptions<import('@vendure/core').Customer>);
        const groups = await customerService.getCustomerGroups(ctx, list.items[0].id);
        const groupNames = groups.map(g => g.name);
        expect(groupNames).toContain('B2B');
        expect(groupNames).toContain('Premium');
    });

    it('creates batch of customers', async () => {
        const step = makeStep('test-customer-batch', {
            strategy: 'UPSERT',
            emailField: 'email',
            firstNameField: 'firstName',
            lastNameField: 'lastName',
        });
        const input = [
            { email: 'john@research.com', firstName: 'John', lastName: 'Doe' },
            { email: 'lisa@privat.de', firstName: 'Lisa', lastName: 'Weber' },
            { email: 'inactive@old.de', firstName: 'Hans', lastName: 'Mueller' },
        ];

        const result = await customerHandler.execute(ctx, step, input);
        expect(result.ok).toBe(3);
        expect(result.fail).toBe(0);
    });

    it('fails for customer missing email (required field)', async () => {
        const step = makeStep('test-no-email', {
            strategy: 'UPSERT',
            emailField: 'email',
        });
        const input = [
            { firstName: 'No', lastName: 'Email' },
        ];

        const result = await customerHandler.execute(ctx, step, input);
        expect(result.fail).toBe(1);
    });

    it('fails on UPDATE strategy for non-existent customer', async () => {
        const step = makeStep('test-update-only', {
            strategy: 'UPDATE',
            emailField: 'email',
        });
        const collector = createErrorCollector();
        const input = [{
            email: 'nonexistent@example.com',
            firstName: 'Ghost',
        }];

        const result = await customerHandler.execute(ctx, step, input, collector.callback);
        expect(result.fail).toBe(1);
    });

    it('skips existing customer with CREATE strategy', async () => {
        const step = makeStep('test-create-only', {
            strategy: 'CREATE',
            emailField: 'email',
            firstNameField: 'firstName',
        });
        const input = [{
            email: 'max@labtech.de',
            firstName: 'Should Not Change',
        }];

        const result = await customerHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1); // Counted as ok (skip)

        const list = await customerService.findAll(ctx, {
            filter: { emailAddress: { eq: 'max@labtech.de' } },
        } as ListQueryOptions<import('@vendure/core').Customer>);
        expect(list.items[0].firstName).toBe('Maximilian'); // Not changed
    });
});

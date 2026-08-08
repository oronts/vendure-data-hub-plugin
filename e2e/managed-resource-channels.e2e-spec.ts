import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import gql from 'graphql-tag';
import { ConnectionType } from '../src/constants/enums';
import { createDataHubTestEnvironment } from './test-config';

interface ChannelReference {
    readonly id: string;
    readonly code: string;
    readonly token: string;
}

interface ConnectionReference {
    readonly id: string;
    readonly code: string;
    readonly channels: readonly ChannelReference[];
}

describe('managed resource channels', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let defaultChannelToken: string;
    let secondaryChannel: ChannelReference;

    beforeAll(async () => {
        await server.init({
            initialData: {
                defaultLanguage: 'en',
                defaultZone: 'Europe',
            },
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();

        const { activeChannel, zones } = await adminClient.query(gql`
            query ManagedResourceChannelSetup {
                activeChannel {
                    token
                    defaultLanguageCode
                    defaultCurrencyCode
                    defaultTaxZone { id }
                    defaultShippingZone { id }
                }
                zones(options: { take: 1 }) {
                    items { id }
                }
            }
        `);
        defaultChannelToken = activeChannel.token;
        let zoneId = activeChannel.defaultTaxZone?.id
            ?? activeChannel.defaultShippingZone?.id
            ?? zones.items[0]?.id;
        if (!zoneId) {
            const { createZone } = await adminClient.query(gql`
                mutation CreateManagedResourceChannelZone {
                    createZone(input: { name: "Managed resource channel" }) { id }
                }
            `);
            zoneId = createZone.id;
        }

        const { createChannel } = await adminClient.query(gql`
            mutation CreateManagedResourceChannel($input: CreateChannelInput!) {
                createChannel(input: $input) {
                    ... on Channel {
                        id
                        code
                        token
                    }
                    ... on ErrorResult {
                        errorCode
                        message
                    }
                }
            }
        `, {
            input: {
                code: 'managed-resource-secondary',
                token: 'managed-resource-secondary',
                defaultLanguageCode: activeChannel.defaultLanguageCode,
                defaultCurrencyCode: activeChannel.defaultCurrencyCode,
                defaultTaxZoneId: zoneId,
                defaultShippingZoneId: zoneId,
                pricesIncludeTax: false,
            },
        });
        if (!createChannel.token) {
            throw new Error(
                `Failed to create managed resource channel: ${createChannel.message}`,
            );
        }
        secondaryChannel = createChannel;
    });

    afterAll(async () => {
        adminClient.setChannelToken(defaultChannelToken);
        await server.destroy();
    });

    it('scopes assignment, unassignment, and physical deletion by channel', async () => {
        const { createDataHubConnection } = await adminClient.query(gql`
            mutation CreateManagedResourceConnection(
                $input: CreateDataHubConnectionInput!
            ) {
                createDataHubConnection(input: $input) {
                    id
                    code
                    channels { id code token }
                }
            }
        `, {
            input: {
                code: 'managed-resource-http',
                type: ConnectionType.HTTP,
                config: { baseUrl: 'https://api.example.com' },
            },
        });
        const connection = createDataHubConnection as ConnectionReference;
        expect(connection.channels).toHaveLength(1);

        adminClient.setChannelToken(secondaryChannel.token);
        const hidden = await getConnectionScope(connection.id);
        expect(hidden.dataHubConnection).toBeNull();
        expect(hidden.dataHubConnections.items).not.toContainEqual(
            expect.objectContaining({ id: connection.id }),
        );

        adminClient.setChannelToken(defaultChannelToken);
        const { assignDataHubConnectionsToChannel } = await adminClient.query(gql`
            mutation AssignManagedResourceConnection(
                $input: AssignDataHubConnectionsToChannelInput!
            ) {
                assignDataHubConnectionsToChannel(input: $input) {
                    id
                    code
                    channels { id code token }
                }
            }
        `, {
            input: {
                connectionIds: [connection.id],
                channelId: secondaryChannel.id,
            },
        });
        expect(assignDataHubConnectionsToChannel[0].channels).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ token: defaultChannelToken }),
                expect.objectContaining({ id: secondaryChannel.id }),
            ]),
        );

        adminClient.setChannelToken(secondaryChannel.token);
        const visible = await getConnectionScope(connection.id);
        expect(visible.dataHubConnection).toMatchObject({
            id: connection.id,
            code: connection.code,
        });
        expect(visible.dataHubConnection.channels).toEqual([
            expect.objectContaining({ id: secondaryChannel.id }),
        ]);
        expect(visible.dataHubConnections.items).toContainEqual(
            expect.objectContaining({ id: connection.id }),
        );

        adminClient.setChannelToken(defaultChannelToken);
        const guardedDelete = await deleteConnection(connection.id);
        expect(guardedDelete.result).toBe('NOT_DELETED');
        expect((await getConnectionScope(connection.id)).dataHubConnection?.id)
            .toBe(connection.id);

        adminClient.setChannelToken(secondaryChannel.token);
        expect((await deleteConnection(connection.id)).result).toBe('DELETED');
        expect((await getConnectionScope(connection.id)).dataHubConnection).toBeNull();

        adminClient.setChannelToken(defaultChannelToken);
        expect((await getConnectionScope(connection.id)).dataHubConnection?.id)
            .toBe(connection.id);

        await adminClient.query(gql`
            mutation ReassignManagedResourceConnection(
                $input: AssignDataHubConnectionsToChannelInput!
            ) {
                assignDataHubConnectionsToChannel(input: $input) { id }
            }
        `, {
            input: {
                connectionIds: [connection.id],
                channelId: secondaryChannel.id,
            },
        });
        const { removeDataHubConnectionsFromChannel } = await adminClient.query(gql`
            mutation RemoveManagedResourceConnection(
                $input: AssignDataHubConnectionsToChannelInput!
            ) {
                removeDataHubConnectionsFromChannel(input: $input) {
                    id
                    channels { id code token }
                }
            }
        `, {
            input: {
                connectionIds: [connection.id],
                channelId: secondaryChannel.id,
            },
        });
        expect(removeDataHubConnectionsFromChannel[0]).toMatchObject({
            id: connection.id,
            channels: [
                expect.objectContaining({ token: defaultChannelToken }),
            ],
        });

        adminClient.setChannelToken(secondaryChannel.token);
        expect((await getConnectionScope(connection.id)).dataHubConnection).toBeNull();

        adminClient.setChannelToken(defaultChannelToken);
        expect((await deleteConnection(connection.id)).result).toBe('DELETED');
        expect((await getConnectionScope(connection.id)).dataHubConnection).toBeNull();
    });

    async function getConnectionScope(id: string): Promise<{
        dataHubConnection: ConnectionReference | null;
        dataHubConnections: {
            readonly items: readonly ConnectionReference[];
            readonly totalItems: number;
        };
    }> {
        return adminClient.query(gql`
            query ManagedResourceConnectionScope($id: ID!) {
                dataHubConnection(id: $id) {
                    id
                    code
                    channels { id code token }
                }
                dataHubConnections {
                    items {
                        id
                        code
                    }
                    totalItems
                }
            }
        `, { id });
    }

    async function deleteConnection(id: string): Promise<{
        readonly result: string;
        readonly message?: string;
    }> {
        const { deleteDataHubConnection } = await adminClient.query(gql`
            mutation DeleteManagedResourceConnection($id: ID!) {
                deleteDataHubConnection(id: $id) {
                    result
                    message
                }
            }
        `, { id });
        return deleteDataHubConnection;
    }
});

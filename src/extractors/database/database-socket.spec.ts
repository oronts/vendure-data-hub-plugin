import { once } from 'events';
import {
    createServer,
    type AddressInfo,
    type Server,
    type Socket,
} from 'net';
import { describe, expect, it } from 'vitest';
import type { SafeRemoteAddresses } from '../../utils/remote-host-security.utils';
import {
    createMysqlSocketFactory,
    createPostgresSocketFactory,
} from './database-socket';

async function startIpv4Server(): Promise<{ port: number; server: Server }> {
    const server = createServer(socket => socket.end());
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return {
        port: (server.address() as AddressInfo).port,
        server,
    };
}

async function closeServer(server: Server): Promise<void> {
    server.close();
    await once(server, 'close');
}

describe('database socket pinning', () => {
    it.each([
        ['PostgreSQL', createPostgresSocketFactory, true],
        ['MySQL', createMysqlSocketFactory, false],
    ] as const)(
        'uses every approved address for %s transport failover',
        async (_database, createFactory, requiresConnect) => {
            const { port, server } = await startIpv4Server();
            const remotes: SafeRemoteAddresses = [
                {
                    hostname: 'db.example.com',
                    address: '::1',
                    family: 6,
                },
                {
                    hostname: 'db.example.com',
                    address: '127.0.0.1',
                    family: 4,
                },
            ];
            let socket: Socket | undefined;

            try {
                const factory = createFactory(remotes, port);
                socket = factory();
                if (requiresConnect) {
                    socket.connect(port, remotes[0].hostname);
                }
                await once(socket, 'connect');

                expect(socket.remoteAddress).toBe('127.0.0.1');
                const secondSocket = factory();
                expect(secondSocket).not.toBe(socket);
                secondSocket.destroy();
            } finally {
                socket?.destroy();
                await closeServer(server);
            }
        },
    );
});

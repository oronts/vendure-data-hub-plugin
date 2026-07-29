import { createConnection, Socket } from 'net';
import {
    createPinnedAddressLookup,
    type SafeRemoteAddresses,
} from '../../utils/remote-host-security.utils';

const REMOTE_ADDRESS_MISMATCH =
    'SSRF protection: connected database address did not match the validated address';

function verifyConnectedAddress(
    socket: Socket,
    remotes: SafeRemoteAddresses,
): void {
    socket.once('connect', () => {
        const approved = remotes.some(
            remote => socket.remoteAddress === remote.address,
        );
        if (!approved) {
            socket.destroy(new Error(REMOTE_ADDRESS_MISMATCH));
        }
    });
}

export function createPostgresSocketFactory(
    remotes: SafeRemoteAddresses,
    port: number,
): () => Socket {
    const hostname = remotes[0].hostname;
    return () => {
        const socket = new Socket();
        const connect = socket.connect.bind(socket);
        socket.connect = (() => connect({
            host: hostname,
            port,
            autoSelectFamily: remotes.length > 1,
            lookup: createPinnedAddressLookup(remotes),
        })) as typeof socket.connect;
        verifyConnectedAddress(socket, remotes);
        return socket;
    };
}

export function createMysqlSocketFactory(
    remotes: SafeRemoteAddresses,
    port: number,
): () => Socket {
    const hostname = remotes[0].hostname;
    return () => {
        const socket = createConnection({
            host: hostname,
            port,
            autoSelectFamily: remotes.length > 1,
            lookup: createPinnedAddressLookup(remotes),
        });
        verifyConnectedAddress(socket, remotes);
        return socket;
    };
}

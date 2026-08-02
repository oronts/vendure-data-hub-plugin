import { PORTS } from '../../../constants/defaults/core-defaults';
import { normalizeRemoteHostname } from '../../../utils/remote-host-security.utils';
import { isBlockedHostname } from '../../../utils/url-security.utils';
import type { QueueConnectionConfig } from './queue-adapter.interface';

export type RabbitMqTransport = 'AMQP' | 'HTTP';

export interface ResolvedRabbitMqConnection {
    readonly host: string;
    readonly port: number;
    readonly username: string;
    readonly password: string;
    readonly vhost: string;
    readonly useTls: boolean;
}

function defaultPort(transport: RabbitMqTransport, useTls: boolean): number {
    if (transport === 'AMQP') {
        return useTls ? PORTS.RABBITMQ_TLS : PORTS.RABBITMQ;
    }
    return useTls
        ? PORTS.RABBITMQ_MANAGEMENT_TLS
        : PORTS.RABBITMQ_MANAGEMENT;
}

export function resolveRabbitMqConnection(
    config: QueueConnectionConfig,
    transport: RabbitMqTransport,
): ResolvedRabbitMqConnection {
    const host = normalizeRemoteHostname(config.host);
    if (isBlockedHostname(host)) {
        throw new Error(
            `SSRF protection: hostname '${host}' is blocked for security reasons`,
        );
    }
    const useTls = config.useTls === true;
    const port = config.port ?? defaultPort(transport, useTls);
    if (!Number.isSafeInteger(port) || port < PORTS.MIN || port > PORTS.MAX) {
        throw new Error(`RabbitMQ port must be an integer from ${PORTS.MIN} to ${PORTS.MAX}`);
    }
    const username = config.username?.trim();
    if (!username) {
        throw new Error('RabbitMQ username is required');
    }
    if (typeof config.password !== 'string' || config.password.length === 0) {
        throw new Error('RabbitMQ password is required');
    }
    return {
        host,
        port,
        username,
        password: config.password,
        vhost: config.vhost?.trim() || '/',
        useTls,
    };
}

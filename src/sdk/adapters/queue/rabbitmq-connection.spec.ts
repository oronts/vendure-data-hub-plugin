import { describe, expect, it } from 'vitest';
import { resolveRabbitMqConnection } from './rabbitmq-connection';

describe('resolveRabbitMqConnection', () => {
    it.each([
        ['AMQP', false, 5672],
        ['AMQP', true, 5671],
        ['HTTP', false, 15672],
        ['HTTP', true, 15671],
    ] as const)('uses the %s TLS=%s direct-adapter default port', (
        transport,
        useTls,
        port,
    ) => {
        expect(resolveRabbitMqConnection({
            host: 'rabbitmq.example.com',
            username: ' data-hub ',
            password: 'secret',
            useTls,
        }, transport)).toEqual({
            host: 'rabbitmq.example.com',
            port,
            username: 'data-hub',
            password: 'secret',
            vhost: '/',
            useTls,
        });
    });

    it.each([
        [{ host: 'rabbitmq.example.com', password: 'secret' }, 'username'],
        [{ host: 'rabbitmq.example.com', username: 'data-hub' }, 'password'],
        [{ host: 'localhost', username: 'data-hub', password: 'secret' }, 'blocked'],
        [{ host: 'rabbitmq.example.com/path', username: 'data-hub', password: 'secret' }, 'URL syntax'],
        [{ host: 'rabbitmq.example.com', port: 65_536, username: 'data-hub', password: 'secret' }, 'port'],
    ])('rejects incomplete or unsafe configuration %#', (config, message) => {
        expect(() => resolveRabbitMqConnection(config as never, 'AMQP'))
            .toThrow(message);
    });
});

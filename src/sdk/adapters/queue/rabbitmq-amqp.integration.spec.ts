import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AckMode } from '../../../constants/enums';
import { configureGlobalSsrfProtection } from '../../../utils/url-security.utils';
import type {
    ConsumeResult,
    QueueConnectionConfig,
} from './queue-adapter.interface';
import { RabbitMQAmqpAdapter } from './rabbitmq-amqp.adapter';

const rabbitMqHost = process.env.DATAHUB_TEST_RABBITMQ_HOST;
const rabbitMqPort = Number(process.env.DATAHUB_TEST_RABBITMQ_PORT);
const rabbitMqUsername = process.env.DATAHUB_TEST_RABBITMQ_USERNAME;
const rabbitMqPassword = process.env.DATAHUB_TEST_RABBITMQ_PASSWORD;
const rabbitMqVhost = process.env.DATAHUB_TEST_RABBITMQ_VHOST;
const hasRabbitMqEnvironment = rabbitMqHost
    && Number.isInteger(rabbitMqPort)
    && rabbitMqPort > 0
    && rabbitMqUsername
    && rabbitMqPassword
    && rabbitMqVhost;
const describeIntegration = hasRabbitMqEnvironment ? describe : describe.skip;
const DELIVERY_WAIT_TIMEOUT_MS = 5_000;
const DELIVERY_RETRY_DELAY_MS = 25;

describeIntegration('RabbitMQ AMQP transport integration', () => {
    const connectionConfig: QueueConnectionConfig = {
        host: rabbitMqHost ?? '',
        port: rabbitMqPort,
        username: rabbitMqUsername,
        password: rabbitMqPassword,
        vhost: rabbitMqVhost,
    };

    beforeAll(() => {
        configureGlobalSsrfProtection({
            allowedHostnames: [rabbitMqHost ?? ''],
        });
    });

    afterAll(() => {
        configureGlobalSsrfProtection({});
    });

    it('publishes, consumes, and manually acknowledges over AMQP', async () => {
        const adapter = new RabbitMQAmqpAdapter();
        const queueName = `datahub-ack-${randomUUID()}`;
        try {
            await expect(adapter.testConnection(connectionConfig)).resolves.toBe(true);
            await expect(adapter.publish(connectionConfig, queueName, [{
                id: 'message-1',
                payload: { orderId: 'order-1' },
            }])).resolves.toEqual([{ success: true, messageId: 'message-1' }]);

            const [delivery] = await waitForDeliveries(
                adapter,
                connectionConfig,
                queueName,
                'integration:ack',
                1,
            );
            expect(delivery).toEqual(expect.objectContaining({
                messageId: 'message-1',
                payload: { orderId: 'order-1' },
                redelivered: false,
            }));
            await expect(
                adapter.ack(connectionConfig, delivery.deliveryTag!),
            ).resolves.toBeUndefined();
        } finally {
            await adapter.destroy();
        }
    });

    it('enforces broker prefetch until the current delivery is settled', async () => {
        const adapter = new RabbitMQAmqpAdapter();
        const queueName = `datahub-prefetch-${randomUUID()}`;
        try {
            await adapter.publish(connectionConfig, queueName, [
                { id: 'message-1', payload: { sequence: 1 } },
                { id: 'message-2', payload: { sequence: 2 } },
            ]);
            const [first] = await waitForDeliveries(
                adapter,
                connectionConfig,
                queueName,
                'integration:prefetch',
                1,
            );

            await delay(DELIVERY_RETRY_DELAY_MS * 4);
            await expect(adapter.consume(connectionConfig, queueName, {
                count: 2,
                ackMode: AckMode.MANUAL,
                prefetch: 1,
                consumerId: 'integration:prefetch',
            })).resolves.toEqual([]);

            await adapter.ack(connectionConfig, first.deliveryTag!);
            const [second] = await waitForDeliveries(
                adapter,
                connectionConfig,
                queueName,
                'integration:prefetch',
                1,
            );
            expect(second.messageId).toBe('message-2');
            await adapter.ack(connectionConfig, second.deliveryTag!);
        } finally {
            await adapter.destroy();
        }
    });

    it('requeues an unsettled delivery when its subscription is stopped', async () => {
        const adapter = new RabbitMQAmqpAdapter();
        const queueName = `datahub-requeue-${randomUUID()}`;
        try {
            await adapter.publish(connectionConfig, queueName, [{
                id: 'message-1',
                payload: { orderId: 'order-1' },
            }]);
            await waitForDeliveries(
                adapter,
                connectionConfig,
                queueName,
                'integration:first-owner',
                1,
            );

            await adapter.stopConsumer('integration:first-owner');
            const [redelivery] = await waitForDeliveries(
                adapter,
                connectionConfig,
                queueName,
                'integration:next-owner',
                1,
            );
            expect(redelivery).toEqual(expect.objectContaining({
                messageId: 'message-1',
                redelivered: true,
            }));
            await adapter.ack(connectionConfig, redelivery.deliveryTag!);
        } finally {
            await adapter.destroy();
        }
    });
});

async function waitForDeliveries(
    adapter: RabbitMQAmqpAdapter,
    connectionConfig: QueueConnectionConfig,
    queueName: string,
    consumerId: string,
    prefetch: number,
): Promise<ConsumeResult[]> {
    const deadline = Date.now() + DELIVERY_WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const deliveries = await adapter.consume(connectionConfig, queueName, {
            count: prefetch,
            ackMode: AckMode.MANUAL,
            prefetch,
            consumerId,
        });
        if (deliveries.length > 0) return deliveries;
        await delay(DELIVERY_RETRY_DELAY_MS);
    }
    throw new Error(`Timed out waiting for RabbitMQ deliveries from ${queueName}`);
}

function delay(durationMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, durationMs));
}

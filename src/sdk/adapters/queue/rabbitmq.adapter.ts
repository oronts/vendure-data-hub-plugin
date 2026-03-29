/** RabbitMQ HTTP Management API adapter. For production use the AMQP adapter instead. */

import {
    QueueAdapter,
    QueueConnectionConfig,
    QueueMessage,
    PublishResult,
    ConsumeResult,
} from './queue-adapter.interface';
import { JsonObject } from '../../../types/index';
import { AckMode } from '../../../constants/enums';
import { HTTP_HEADERS, CONTENT_TYPES, AUTH_SCHEMES, HTTP_STATUS, HTTP } from '../../../constants/index';
import { isBlockedHostname } from '../../../utils/url-security.utils';
import { getErrorMessage } from '../../../utils/error.utils';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { LOGGER_CONTEXTS } from '../../../constants/core';

const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.RABBITMQ_HTTP_ADAPTER);

export class RabbitMQAdapter implements QueueAdapter {
    readonly code = 'rabbitmq';
    readonly name = 'RabbitMQ';
    readonly description = 'RabbitMQ message broker via HTTP Management API';

    private buildAuthHeader(config: QueueConnectionConfig): string {
        const username = config.username ?? 'guest';
        const password = config.password ?? 'guest';
        return `${AUTH_SCHEMES.BASIC} ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }

    private buildBaseUrl(config: QueueConnectionConfig): string {
        const host = config.host ?? 'localhost';
        if (isBlockedHostname(host)) {
            throw new Error(`SSRF protection: hostname '${host}' is blocked for security reasons`);
        }
        const port = config.port ?? 15672;
        const protocol = config.useTls ? 'https' : 'http';
        return `${protocol}://${host}:${port}/api`;
    }

    private encodeVhost(config: QueueConnectionConfig): string {
        return encodeURIComponent(config.vhost ?? '/');
    }

    async publish(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]> {
        const baseUrl = this.buildBaseUrl(connectionConfig);
        const auth = this.buildAuthHeader(connectionConfig);
        const vhost = this.encodeVhost(connectionConfig);
        const results: PublishResult[] = [];

        for (const msg of messages) {
            const publishUrl = `${baseUrl}/exchanges/${vhost}/amq.default/publish`;

            const rabbitMessage = {
                properties: {
                    message_id: msg.id,
                    delivery_mode: msg.persistent ? 2 : 1,
                    priority: msg.priority,
                    expiration: msg.ttlMs ? String(msg.ttlMs) : undefined,
                    headers: msg.headers ?? {},
                },
                routing_key: msg.routingKey ?? queueName,
                payload: JSON.stringify(msg.payload),
                payload_encoding: 'string',
            };

            try {
                const response = await fetch(publishUrl, {
                    method: 'POST',
                    headers: {
                        [HTTP_HEADERS.AUTHORIZATION]: auth,
                        [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
                    },
                    body: JSON.stringify(rabbitMessage),
                    signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
                });

                if (response.ok) {
                    const body = await response.json() as { routed?: boolean };
                    results.push({
                        success: body.routed !== false,
                        messageId: msg.id,
                        error: body.routed === false ? 'Message was not routed to any queue' : undefined,
                    });
                } else {
                    const errorText = await response.text();
                    results.push({
                        success: false,
                        messageId: msg.id,
                        error: `HTTP ${response.status}: ${errorText}`,
                    });
                }
            } catch (error) {
                results.push({
                    success: false,
                    messageId: msg.id,
                    error: getErrorMessage(error),
                });
            }
        }

        return results;
    }

    async consume(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        options: {
            count: number;
            ackMode: AckMode;
            prefetch?: number;
        },
    ): Promise<ConsumeResult[]> {
        const baseUrl = this.buildBaseUrl(connectionConfig);
        const auth = this.buildAuthHeader(connectionConfig);
        const vhost = this.encodeVhost(connectionConfig);

        const getUrl = `${baseUrl}/queues/${vhost}/${encodeURIComponent(queueName)}/get`;

        try {
            const response = await fetch(getUrl, {
                method: 'POST',
                headers: {
                    [HTTP_HEADERS.AUTHORIZATION]: auth,
                    [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
                },
                body: JSON.stringify({
                    count: options.count,
                    ackmode: 'ack_requeue_false',
                    encoding: 'auto',
                }),
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            });

            if (!response.ok) {
                if (response.status === HTTP_STATUS.NOT_FOUND) {
                    return [];
                }
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            interface RabbitMQMessage {
                payload?: string;
                payload_encoding?: string;
                properties?: {
                    message_id?: string;
                    headers?: Record<string, string>;
                };
                delivery_tag?: number;
                redelivered?: boolean;
            }
            const messages = await response.json() as RabbitMQMessage[];
            if (!Array.isArray(messages) || messages.length === 0) {
                return [];
            }

            return messages.map((msg: RabbitMQMessage): ConsumeResult => {
                let payload: JsonObject;
                try {
                    const payloadStr = msg.payload || '';
                    if (msg.payload_encoding === 'base64') {
                        payload = JSON.parse(Buffer.from(payloadStr, 'base64').toString('utf-8'));
                    } else {
                        payload = JSON.parse(payloadStr);
                    }
                } catch {
                    // JSON parse failed - wrap raw payload
                    payload = { rawPayload: String(msg.payload || '') };
                }

                return {
                    messageId: msg.properties?.message_id || crypto.randomUUID(),
                    payload,
                    headers: msg.properties?.headers,
                    deliveryTag: String(msg.delivery_tag),
                    redelivered: msg.redelivered,
                };
            });
        } catch (error) {
            throw new Error(`Failed to consume from RabbitMQ: ${getErrorMessage(error)}`);
        }
    }

    async ack(
        _connectionConfig: QueueConnectionConfig,
        _deliveryTag: string,
    ): Promise<void> {
        logger.warn('RabbitMQ HTTP adapter does not support individual message acknowledgement. Messages are auto-acked on consume. Use rabbitmq-amqp adapter for manual ack support.');
    }

    async nack(
        _connectionConfig: QueueConnectionConfig,
        _deliveryTag: string,
        _requeue: boolean,
    ): Promise<void> {
        logger.warn('RabbitMQ HTTP adapter does not support individual message rejection. Messages are auto-acked on consume. Use rabbitmq-amqp adapter for manual nack support.');
    }

    async destroy(): Promise<void> {
        // No persistent resources to clean up for HTTP-based adapter
    }

    async testConnection(connectionConfig: QueueConnectionConfig): Promise<boolean> {
        const baseUrl = this.buildBaseUrl(connectionConfig);
        const auth = this.buildAuthHeader(connectionConfig);

        try {
            const response = await fetch(`${baseUrl}/overview`, {
                method: 'GET',
                headers: { [HTTP_HEADERS.AUTHORIZATION]: auth },
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            });
            return response.ok;
        } catch {
            // Connection test failed - return false
            return false;
        }
    }
}

export const rabbitmqAdapter = new RabbitMQAdapter();

import { createHmac, randomBytes } from 'node:crypto';

const CONNECTION_IDENTITY_KEY = randomBytes(32);

export function createQueueConnectionIdentity(
    adapterCode: string,
    config: Readonly<Record<string, unknown>>,
): string {
    const digest = createHmac('sha256', CONNECTION_IDENTITY_KEY)
        .update(adapterCode)
        .update('\0')
        .update(serializeIdentityValue(config))
        .digest('hex');
    return `${adapterCode}:${digest}`;
}

function serializeIdentityValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'bigint') return `${value.toString()}n`;
    if (Array.isArray(value)) {
        return `[${value.map(item => serializeIdentityValue(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${serializeIdentityValue(item)}`);
        return `{${entries.join(',')}}`;
    }
    return `${typeof value}:${String(value)}`;
}

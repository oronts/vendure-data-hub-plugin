import { JsonObject, LoaderAdapter, LoadContext, LoadResult, StepConfigSchema } from '../../../../src';

export const webhookNotifySchema: StepConfigSchema = {
    fields: [
        { key: 'endpoint', type: 'string', label: 'Webhook URL', required: true, placeholder: 'https://api.example.com/webhook' },
        {
            key: 'method',
            type: 'select',
            label: 'HTTP Method',
            required: false,
            defaultValue: 'POST',
            options: [
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
                { value: 'PATCH', label: 'PATCH' },
            ],
        },
        { key: 'headers', type: 'json', label: 'Headers', required: false, placeholder: '{"Authorization": "Bearer {{secret:api-key}}"}' },
        {
            key: 'batchMode',
            type: 'select',
            label: 'Batch Mode',
            required: false,
            defaultValue: 'single',
            options: [
                { value: 'single', label: 'Single - One request per record' },
                { value: 'batch', label: 'Batch - All records in one request' },
            ],
        },
        { key: 'maxBatchSize', type: 'number', label: 'Max Batch Size', required: false, defaultValue: 100 },
        { key: 'retries', type: 'number', label: 'Retries', required: false, defaultValue: 3 },
        { key: 'timeoutMs', type: 'number', label: 'Timeout (ms)', required: false, defaultValue: 30000 },
    ],
};

type HttpMethod = 'POST' | 'PUT' | 'PATCH';
type BatchMode = 'single' | 'batch';

interface WebhookNotifyConfig {
    endpoint: string;
    method?: HttpMethod;
    headers?: Record<string, string>;
    batchMode?: BatchMode;
    maxBatchSize?: number;
    retries?: number;
    timeoutMs?: number;
}

interface LoadError {
    record: JsonObject;
    message: string;
}

async function resolveHeaders(headers: Record<string, string> | undefined, secrets: LoadContext['secrets']): Promise<Record<string, string>> {
    if (!headers) return {};
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        const secretMatch = value.match(/\{\{secret:([^}]+)\}\}/);
        if (secretMatch) {
            const secretValue = await secrets.get(secretMatch[1]);
            resolved[key] = value.replace(secretMatch[0], secretValue ?? '');
        } else {
            resolved[key] = value;
        }
    }
    return resolved;
}

async function sendWebhook(
    endpoint: string, method: string, headers: Record<string, string>, body: unknown, retries: number, timeoutMs: number
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (response.ok) return { success: true, statusCode: response.status };
            lastError = `HTTP ${response.status}: ${response.statusText}`;
        } catch (err: unknown) {
            lastError = (err as Error).message || 'Unknown error';
        }

        if (attempt < retries) await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }

    return { success: false, error: lastError };
}

export const webhookNotifyLoader: LoaderAdapter<WebhookNotifyConfig> = {
    type: 'loader',
    code: 'webhookNotify',
    name: 'Webhook Notify',
    description: 'Send records to an external webhook endpoint',
    category: 'external',
    schema: webhookNotifySchema,
    icon: 'webhook',
    version: '1.0.0',

    async load(context: LoadContext, config: WebhookNotifyConfig, records: readonly JsonObject[]): Promise<LoadResult> {
        const { endpoint, method = 'POST', headers, batchMode = 'single', maxBatchSize = 100, retries = 3, timeoutMs = 30000 } = config;

        if (context.dryRun) {
            context.logger.info(`[DRY RUN] Would send ${records.length} records to ${endpoint}`);
            return { succeeded: records.length, failed: 0 };
        }

        const resolvedHeaders = await resolveHeaders(headers, context.secrets);
        let succeeded = 0, failed = 0;
        const errors: LoadError[] = [];

        if (batchMode === 'batch') {
            for (let i = 0; i < records.length; i += maxBatchSize) {
                const batch = records.slice(i, i + maxBatchSize);
                const result = await sendWebhook(endpoint, method, resolvedHeaders, batch, retries, timeoutMs);
                if (result.success) {
                    succeeded += batch.length;
                } else {
                    failed += batch.length;
                    batch.forEach(record => errors.push({ record, message: result.error || 'Batch request failed' }));
                }
            }
        } else {
            for (const record of records) {
                const result = await sendWebhook(endpoint, method, resolvedHeaders, record, retries, timeoutMs);
                if (result.success) {
                    succeeded++;
                } else {
                    failed++;
                    errors.push({ record, message: result.error || 'Request failed' });
                }
            }
        }

        context.logger.info(`Webhook notify: ${succeeded} sent, ${failed} failed`);
        return { succeeded, failed, errors };
    },
};

export default webhookNotifyLoader;

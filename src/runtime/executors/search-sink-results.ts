export interface SearchBatchItemError {
    index: number;
    message: string;
}

export interface SearchBatchResult {
    ok: number;
    fail: number;
    errors: SearchBatchItemError[];
}

function failedBatch(expectedCount: number, message: string): SearchBatchResult {
    return {
        ok: 0,
        fail: expectedCount,
        errors: Array.from({ length: expectedCount }, (_, index) => ({ index, message })),
    };
}

function parseJsonObject(body: string, service: string): Record<string, unknown> {
    let value: unknown;
    try {
        value = JSON.parse(body);
    } catch {
        throw new Error(`${service} returned an invalid JSON response`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${service} returned an invalid response object`);
    }
    return value as Record<string, unknown>;
}

function errorMessage(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim()) return value;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.reason === 'string' && record.reason.trim()) return record.reason;
        if (typeof record.message === 'string' && record.message.trim()) return record.message;
        if (typeof record.type === 'string' && record.type.trim()) return record.type;
    }
    return fallback;
}

export function parseElasticBulkResult(
    body: string,
    expectedCount: number,
): SearchBatchResult {
    try {
        const root = parseJsonObject(body, 'Elasticsearch/OpenSearch');
        if (!Array.isArray(root.items) || root.items.length !== expectedCount) {
            return failedBatch(
                expectedCount,
                `Elasticsearch/OpenSearch returned ${Array.isArray(root.items) ? root.items.length : 0} item results for ${expectedCount} records`,
            );
        }

        const errors: SearchBatchItemError[] = [];
        let ok = 0;
        root.items.forEach((item, index) => {
            const operation = item && typeof item === 'object'
                ? Object.values(item as Record<string, unknown>)[0]
                : undefined;
            const result = operation && typeof operation === 'object'
                ? operation as Record<string, unknown>
                : undefined;
            const status = result?.status;
            if (typeof status === 'number' && status >= 200 && status < 300 && result?.error === undefined) {
                ok++;
                return;
            }
            errors.push({
                index,
                message: errorMessage(
                    result?.error,
                    `Elasticsearch/OpenSearch item failed with status ${String(status ?? 'unknown')}`,
                ),
            });
        });
        return { ok, fail: errors.length, errors };
    } catch (error) {
        return failedBatch(
            expectedCount,
            error instanceof Error ? error.message : 'Elasticsearch/OpenSearch response could not be parsed',
        );
    }
}

export function parseTypesenseImportResult(
    body: string,
    expectedCount: number,
): SearchBatchResult {
    const lines = body.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length !== expectedCount) {
        return failedBatch(
            expectedCount,
            `Typesense returned ${lines.length} item results for ${expectedCount} records`,
        );
    }

    const errors: SearchBatchItemError[] = [];
    let ok = 0;
    for (const [index, line] of lines.entries()) {
        try {
            const result = parseJsonObject(line, 'Typesense');
            if (result.success === true) {
                ok++;
            } else {
                errors.push({
                    index,
                    message: errorMessage(result.error, 'Typesense item import failed'),
                });
            }
        } catch (error) {
            errors.push({
                index,
                message: error instanceof Error ? error.message : 'Typesense item result could not be parsed',
            });
        }
    }
    return { ok, fail: errors.length, errors };
}

export function readNumericTaskId(
    body: string,
    field: 'taskUid' | 'taskID',
    service: string,
): number {
    const result = parseJsonObject(body, service);
    const taskId = result[field];
    if (!Number.isSafeInteger(taskId) || (taskId as number) < 0) {
        throw new Error(`${service} did not return a valid ${field}`);
    }
    return taskId as number;
}

export function readTaskStatus(body: string, service: string): {
    status: string;
    error?: string;
} {
    const result = parseJsonObject(body, service);
    const status = result.status;
    if (typeof status !== 'string' || !status.trim()) {
        throw new Error(`${service} task response did not contain a status`);
    }
    return {
        status,
        error: result.error === undefined
            ? undefined
            : errorMessage(result.error, `${service} task failed`),
    };
}

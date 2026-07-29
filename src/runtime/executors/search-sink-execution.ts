import { HTTP } from '../../constants/defaults';
import { HttpMethod } from '../../constants/enums';
import { secureFetch } from '../../utils/secure-fetch.utils';
import { readResponseText } from '../../utils/secure-response-body.utils';
import { sleep } from '../../utils/retry.utils';
import type { OnRecordErrorCallback, RecordObject } from '../executor-types';
import { getPath } from '../path.utils';
import { readTaskStatus, type SearchBatchResult } from './search-sink-results';

const SEARCH_RESPONSE_BODY_LIMIT_BYTES = 1024 * 1024;
const SEARCH_TASK_POLL_INTERVAL_MS = 100;
const SEARCH_TASK_MAX_POLLS = Math.max(
    1,
    Math.ceil(HTTP.TIMEOUT_MS / SEARCH_TASK_POLL_INTERVAL_MS),
);

export async function readSearchResponseText(
    response: Response,
    service: string,
): Promise<string> {
    return readResponseText(response, {
        maxBytes: SEARCH_RESPONSE_BODY_LIMIT_BYTES,
        context: `${service} response`,
    });
}

export async function reportSearchBatchErrors(
    stepKey: string,
    batch: RecordObject[],
    result: SearchBatchResult,
    onRecordError?: OnRecordErrorCallback,
): Promise<void> {
    if (!onRecordError) return;
    for (const error of result.errors) {
        await onRecordError(stepKey, error.message, batch[error.index] ?? {});
    }
}

export async function pollSearchTask(
    service: string,
    url: string,
    headers: Record<string, string>,
    completedStatuses: readonly string[],
    failedStatuses: readonly string[],
): Promise<void> {
    for (let poll = 0; poll < SEARCH_TASK_MAX_POLLS; poll++) {
        const response = await secureFetch(url, {
            method: HttpMethod.GET,
            headers,
            signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
        });
        const body = await readSearchResponseText(response, `${service} task`);
        if (!response.ok) {
            throw new Error(`${service} task status request failed: HTTP ${response.status}`);
        }
        const task = readTaskStatus(body, service);
        if (completedStatuses.includes(task.status)) return;
        if (failedStatuses.includes(task.status)) {
            throw new Error(task.error ?? `${service} task ended with status ${task.status}`);
        }
        if (poll + 1 < SEARCH_TASK_MAX_POLLS) {
            await sleep(SEARCH_TASK_POLL_INTERVAL_MS);
        }
    }
    throw new Error(`${service} task did not complete within ${HTTP.TIMEOUT_MS}ms`);
}

export async function validateSearchIdentities(
    stepKey: string,
    input: RecordObject[],
    idField: string,
    onRecordError?: OnRecordErrorCallback,
): Promise<{ valid: RecordObject[]; invalid: number }> {
    const valid: RecordObject[] = [];
    let invalid = 0;
    for (const record of input) {
        const value = getPath(record, idField);
        const id = value == null ? '' : String(value).trim();
        if (!id) {
            invalid++;
            if (onRecordError) {
                await onRecordError(
                    stepKey,
                    `Search record is missing identity field "${idField}"`,
                    record,
                );
            }
            continue;
        }
        valid.push(record);
    }
    return { valid, invalid };
}

export interface ResponseBodyReadOptions {
    maxBytes: number;
    context?: string;
}

export class ResponseBodyTooLargeError extends Error {
    readonly code = 'RESPONSE_BODY_TOO_LARGE';

    constructor(
        readonly maxBytes: number,
        readonly receivedBytes?: number,
        context = 'HTTP response body',
    ) {
        const received = receivedBytes === undefined ? '' : `; received at least ${receivedBytes} bytes`;
        super(`${context} exceeds the ${maxBytes}-byte limit${received}`);
        this.name = 'ResponseBodyTooLargeError';
    }
}

export async function readResponseBytes(
    response: Response,
    options: ResponseBodyReadOptions,
): Promise<Uint8Array> {
    validateMaxBytes(options.maxBytes);
    const declaredLength = parseContentLength(response.headers.get('content-length'));
    if (declaredLength !== null && declaredLength > options.maxBytes) {
        await cancelResponseBody(response);
        throw new ResponseBodyTooLargeError(options.maxBytes, declaredLength, options.context);
    }
    if (!response.body) return new Uint8Array();

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
        let readResult = await reader.read();
        while (!readResult.done) {
            const value = readResult.value;
            if (value) {
                totalBytes += value.byteLength;
                if (totalBytes > options.maxBytes) {
                    await cancelReader(reader);
                    throw new ResponseBodyTooLargeError(options.maxBytes, totalBytes, options.context);
                }
                chunks.push(value.slice());
            }
            readResult = await reader.read();
        }
    } finally {
        reader.releaseLock();
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

export async function readResponseArrayBuffer(
    response: Response,
    options: ResponseBodyReadOptions,
): Promise<ArrayBuffer> {
    const bytes = await readResponseBytes(response, options);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function readResponseText(
    response: Response,
    options: ResponseBodyReadOptions,
): Promise<string> {
    return new TextDecoder().decode(await readResponseBytes(response, options));
}

export async function readResponseJson<T = unknown>(
    response: Response,
    options: ResponseBodyReadOptions,
): Promise<T> {
    return JSON.parse(await readResponseText(response, options)) as T;
}

function validateMaxBytes(maxBytes: number): void {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
        throw new Error('Response body limit must be a positive safe integer');
    }
}

function parseContentLength(value: string | null): number | null {
    if (!value || !/^\d+$/.test(value.trim())) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
        await reader.cancel('Response body exceeded its configured byte limit');
    } catch {
        // Preserve the size-limit error when a transport cannot be cancelled cleanly.
    }
}

async function cancelResponseBody(response: Response): Promise<void> {
    try {
        await response.body?.cancel('Declared response body exceeds its configured byte limit');
    } catch {
        // Preserve the size-limit error when a transport cannot be cancelled cleanly.
    }
}

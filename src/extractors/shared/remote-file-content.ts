import { Writable } from 'node:stream';
import { FILE_STORAGE } from '../../constants/defaults/storage-defaults';

class BoundedBufferCollector {
    private readonly chunks: Buffer[] = [];
    private byteLength = 0;

    constructor(
        private readonly source: string,
        private readonly maxBytes: number,
    ) {}

    append(chunk: Uint8Array): void {
        const nextLength = this.byteLength + chunk.byteLength;
        if (nextLength > this.maxBytes) {
            throwRemoteFileSizeError(this.source, this.maxBytes);
        }
        this.chunks.push(Buffer.from(chunk));
        this.byteLength = nextLength;
    }

    toBuffer(): Buffer {
        return Buffer.concat(this.chunks, this.byteLength);
    }
}

export function assertRemoteFileSize(
    byteLength: number | undefined,
    source: string,
    maxBytes: number = FILE_STORAGE.MAX_FILE_SIZE_BYTES,
): void {
    if (byteLength === undefined) return;
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
        throw new Error(`Remote file size is invalid for ${source}`);
    }
    if (byteLength > maxBytes) {
        throwRemoteFileSizeError(source, maxBytes);
    }
}

export async function collectRemoteFileBody(
    body: unknown,
    source: string,
    maxBytes: number = FILE_STORAGE.MAX_FILE_SIZE_BYTES,
): Promise<Buffer> {
    if (!isAsyncIterable(body)) {
        throw new Error(`Remote file body is not streamable for ${source}`);
    }

    const collector = new BoundedBufferCollector(source, maxBytes);
    for await (const chunk of body) {
        collector.append(chunk);
    }
    return collector.toBuffer();
}

export function createBoundedBufferSink(
    source: string,
    maxBytes: number = FILE_STORAGE.MAX_FILE_SIZE_BYTES,
): { writable: Writable; toBuffer: () => Buffer } {
    const collector = new BoundedBufferCollector(source, maxBytes);
    const writable = new Writable({
        write(chunk: unknown, encoding, callback) {
            try {
                if (typeof chunk === 'string') {
                    collector.append(Buffer.from(chunk, encoding));
                } else if (chunk instanceof Uint8Array) {
                    collector.append(chunk);
                } else {
                    throw new Error(`Remote file stream returned an invalid chunk for ${source}`);
                }
                callback();
            } catch (error) {
                callback(error instanceof Error ? error : new Error(String(error)));
            }
        },
    });

    return { writable, toBuffer: () => collector.toBuffer() };
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
    return value !== null
        && typeof value === 'object'
        && typeof Reflect.get(value, Symbol.asyncIterator) === 'function';
}

function throwRemoteFileSizeError(source: string, maxBytes: number): never {
    throw new Error(`Remote file exceeds the ${maxBytes}-byte limit: ${source}`);
}

import { ParseError } from '../types';
import { STREAMING } from '../../constants';

export const DEFAULT_CHUNK_SIZE = STREAMING.DEFAULT_CHUNK_SIZE;
export const MAX_BUFFER_SIZE = STREAMING.MAX_BUFFER_SIZE;

export interface ChunkResult<T> {
    /** Records successfully parsed in this chunk */
    records: T[];
    /** Errors encountered in this chunk */
    errors: ParseError[];
    /** Whether more chunks are available */
    hasMore: boolean;
    /** Current position/offset */
    position: number;
}

export interface StreamOptions {
    /** Records per chunk */
    chunkSize?: number;
    /** Starting offset */
    offset?: number;
    /** Maximum records to process */
    limit?: number;
    /** Callback for progress updates */
    onProgress?: (processed: number, total?: number) => void;
}

export function* chunkArray<T>(items: T[], chunkSize: number = DEFAULT_CHUNK_SIZE): Generator<T[]> {
    for (let i = 0; i < items.length; i += chunkSize) {
        yield items.slice(i, i + chunkSize);
    }
}

export async function processInChunks<T, R>(
    items: T[],
    processor: (chunk: T[], index: number) => Promise<R[]>,
    options: StreamOptions = {},
): Promise<{ results: R[]; errors: ParseError[] }> {
    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? Infinity;

    const results: R[] = [];
    const errors: ParseError[] = [];

    let processed = 0;
    let chunkIndex = 0;

    const itemsToProcess = items.slice(offset, offset + limit);

    for (const chunk of Array.from(chunkArray(itemsToProcess, chunkSize))) {
        try {
            const chunkResults = await processor(chunk, chunkIndex);
            results.push(...chunkResults);
        } catch (error) {
            errors.push({
                message: error instanceof Error ? error.message : 'Chunk processing error',
                row: offset + processed,
            });
        }

        processed += chunk.length;
        chunkIndex++;

        if (options.onProgress) {
            options.onProgress(processed, itemsToProcess.length);
        }
    }

    return { results, errors };
}

export class LineReader {
    private buffer: string = '';
    private position: number = 0;
    private lineNumber: number = 0;

    constructor(
        private content: string,
        private lineEnding: string = '\n',
    ) {}

    hasNext(): boolean {
        return this.position < this.content.length;
    }

    next(): { line: string; lineNumber: number } | null {
        if (!this.hasNext()) {
            return null;
        }

        const nextLineEnd = this.content.indexOf(this.lineEnding, this.position);

        let line: string;
        if (nextLineEnd === -1) {
            // Last line without ending
            line = this.content.slice(this.position);
            this.position = this.content.length;
        } else {
            line = this.content.slice(this.position, nextLineEnd);
            this.position = nextLineEnd + this.lineEnding.length;
        }

        this.lineNumber++;
        return { line, lineNumber: this.lineNumber };
    }

    readLines(count: number): Array<{ line: string; lineNumber: number }> {
        const lines: Array<{ line: string; lineNumber: number }> = [];
        while (lines.length < count) {
            const result = this.next();
            if (!result) break;
            lines.push(result);
        }
        return lines;
    }

    skip(count: number): void {
        for (let i = 0; i < count && this.hasNext(); i++) {
            this.next();
        }
    }

    reset(): void {
        this.position = 0;
        this.lineNumber = 0;
        this.buffer = '';
    }

    getLineNumber(): number {
        return this.lineNumber;
    }
}

export class BatchBuffer<T> {
    private items: T[] = [];
    private flushCallback?: (items: T[]) => Promise<void> | void;

    constructor(
        private batchSize: number = DEFAULT_CHUNK_SIZE,
        private maxSize: number = MAX_BUFFER_SIZE,
    ) {}

    onFlush(callback: (items: T[]) => Promise<void> | void): void {
        this.flushCallback = callback;
    }

    async add(item: T): Promise<void> {
        this.items.push(item);

        if (this.items.length >= this.batchSize || this.items.length >= this.maxSize) {
            await this.flush();
        }
    }

    async addAll(items: T[]): Promise<void> {
        for (const item of items) {
            await this.add(item);
        }
    }

    async flush(): Promise<void> {
        if (this.items.length === 0) return;

        const batch = this.items;
        this.items = [];

        if (this.flushCallback) {
            await this.flushCallback(batch);
        }
    }

    size(): number {
        return this.items.length;
    }

    peek(): T[] {
        return [...this.items];
    }

    clear(): void {
        this.items = [];
    }
}

export function throttle<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    delayMs: number,
): T {
    let lastCall = 0;

    return (async (...args: Parameters<T>) => {
        const now = Date.now();
        const elapsed = now - lastCall;

        if (elapsed < delayMs) {
            await new Promise(resolve => setTimeout(resolve, delayMs - elapsed));
        }

        lastCall = Date.now();
        return fn(...args);
    }) as T;
}

export async function mapWithConcurrency<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    concurrency: number = STREAMING.DEFAULT_CONCURRENCY,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    const executing = new Set<Promise<void>>();

    for (let i = 0; i < items.length; i++) {
        const promise = (async () => {
            results[i] = await processor(items[i], i);
        })();

        const managed = promise.finally(() => executing.delete(managed));
        executing.add(managed);

        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }

    await Promise.all(executing);
    return results;
}

export function estimateRecordCount(
    contentSize: number,
    avgRecordSize: number = STREAMING.DEFAULT_AVG_RECORD_SIZE,
): number {
    if (contentSize <= 0 || avgRecordSize <= 0) {
        return 0;
    }
    return Math.ceil(contentSize / avgRecordSize);
}

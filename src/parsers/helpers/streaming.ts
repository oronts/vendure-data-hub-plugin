/**
 * DataHub Parsers - Streaming Utilities
 *
 * Helper functions for processing data in chunks and streams.
 */

import { ParseError } from '../types';
import { STREAMING } from '../../constants';

/**
 * Default chunk size for streaming operations (from centralized constants)
 */
export const DEFAULT_CHUNK_SIZE = STREAMING.DEFAULT_CHUNK_SIZE;

/**
 * Maximum buffer size before forcing flush (from centralized constants)
 */
export const MAX_BUFFER_SIZE = STREAMING.MAX_BUFFER_SIZE;

/**
 * Chunk processing result
 */
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

/**
 * Stream processing options
 */
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

/**
 * Create a chunked iterator from an array
 *
 * @param items - Array of items to chunk
 * @param chunkSize - Size of each chunk
 * @yields Chunks of items
 */
export function* chunkArray<T>(items: T[], chunkSize: number = DEFAULT_CHUNK_SIZE): Generator<T[]> {
    for (let i = 0; i < items.length; i += chunkSize) {
        yield items.slice(i, i + chunkSize);
    }
}

/**
 * Process items in chunks with async callback
 *
 * @param items - Items to process
 * @param processor - Async function to process each chunk
 * @param options - Processing options
 * @returns Aggregated results
 */
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

/**
 * Line reader for processing text content line by line
 */
export class LineReader {
    private buffer: string = '';
    private position: number = 0;
    private lineNumber: number = 0;

    constructor(
        private content: string,
        private lineEnding: string = '\n',
    ) {}

    /**
     * Check if more lines are available
     */
    hasNext(): boolean {
        return this.position < this.content.length;
    }

    /**
     * Read next line
     */
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

    /**
     * Read next N lines
     */
    readLines(count: number): Array<{ line: string; lineNumber: number }> {
        const lines: Array<{ line: string; lineNumber: number }> = [];
        while (lines.length < count) {
            const result = this.next();
            if (!result) break;
            lines.push(result);
        }
        return lines;
    }

    /**
     * Skip N lines
     */
    skip(count: number): void {
        for (let i = 0; i < count && this.hasNext(); i++) {
            this.next();
        }
    }

    /**
     * Reset to beginning
     */
    reset(): void {
        this.position = 0;
        this.lineNumber = 0;
        this.buffer = '';
    }

    /**
     * Get current line number
     */
    getLineNumber(): number {
        return this.lineNumber;
    }
}

/**
 * Buffer accumulator for batch processing
 */
export class BatchBuffer<T> {
    private items: T[] = [];
    private flushCallback?: (items: T[]) => Promise<void> | void;

    constructor(
        private batchSize: number = DEFAULT_CHUNK_SIZE,
        private maxSize: number = MAX_BUFFER_SIZE,
    ) {}

    /**
     * Set flush callback
     */
    onFlush(callback: (items: T[]) => Promise<void> | void): void {
        this.flushCallback = callback;
    }

    /**
     * Add item to buffer
     */
    async add(item: T): Promise<void> {
        this.items.push(item);

        if (this.items.length >= this.batchSize || this.items.length >= this.maxSize) {
            await this.flush();
        }
    }

    /**
     * Add multiple items
     */
    async addAll(items: T[]): Promise<void> {
        for (const item of items) {
            await this.add(item);
        }
    }

    /**
     * Flush buffer
     */
    async flush(): Promise<void> {
        if (this.items.length === 0) return;

        const batch = this.items;
        this.items = [];

        if (this.flushCallback) {
            await this.flushCallback(batch);
        }
    }

    /**
     * Get current buffer size
     */
    size(): number {
        return this.items.length;
    }

    /**
     * Get buffered items without flushing
     */
    peek(): T[] {
        return [...this.items];
    }

    /**
     * Clear buffer without flushing
     */
    clear(): void {
        this.items = [];
    }
}

/**
 * Create a throttled async function
 *
 * @param fn - Function to throttle
 * @param delayMs - Minimum delay between calls
 * @returns Throttled function
 */
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

/**
 * Run async operations with concurrency limit
 *
 * @param items - Items to process
 * @param processor - Async processor function
 * @param concurrency - Maximum concurrent operations
 * @returns Results in order
 */
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

/**
 * Estimate total records from content size
 *
 * @param contentSize - Size in bytes
 * @param avgRecordSize - Average record size in bytes (estimated)
 * @returns Estimated record count
 */
export function estimateRecordCount(
    contentSize: number,
    avgRecordSize: number = STREAMING.DEFAULT_AVG_RECORD_SIZE,
): number {
    if (contentSize <= 0 || avgRecordSize <= 0) {
        return 0;
    }
    return Math.ceil(contentSize / avgRecordSize);
}

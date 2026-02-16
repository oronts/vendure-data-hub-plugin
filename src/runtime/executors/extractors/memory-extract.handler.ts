/**
 * Memory Extract Handler
 *
 * Extracts records from in-memory sources:
 * - inMemory: Direct data from webhook payloads or inline definitions
 * - generator: Synthetic test data generation
 *
 * @module runtime/executors/extractors
 */

import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { RecordObject } from '../../executor-types';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { LOGGER_CONTEXTS, EXTRACTOR_CODE } from '../../../constants/index';
import {
    ExtractHandler,
    ExtractHandlerContext,
    getExtractConfig,
} from './extract-handler.interface';

interface InMemoryExtractConfig {
    adapterCode?: string;
    data?: unknown;
}

interface GeneratorExtractConfig {
    adapterCode?: string;
    count?: number;
    template?: Record<string, unknown>;
}

@Injectable()
export class MemoryExtractHandler implements ExtractHandler {
    private readonly logger: DataHubLogger;

    constructor(loggerFactory: DataHubLoggerFactory) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXTRACT_EXECUTOR);
    }

    async extract(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { step } = context;
        const cfg = getExtractConfig<InMemoryExtractConfig | GeneratorExtractConfig>(step);
        const adapterCode = cfg.adapterCode;

        if (adapterCode === EXTRACTOR_CODE.IN_MEMORY) {
            return this.extractInMemory(context);
        }
        if (adapterCode === EXTRACTOR_CODE.GENERATOR) {
            return this.extractGenerator(context);
        }

        this.logger.warn('Unknown memory extractor type', { stepKey: step.key, adapterCode });
        return [];
    }

    async extractInMemory(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { step } = context;
        const cfg = getExtractConfig<InMemoryExtractConfig>(step);
        const data = cfg.data;

        if (data === undefined || data === null) {
            this.logger.warn('inMemory extractor: no data provided', { stepKey: step.key });
            return [];
        }

        if (Array.isArray(data)) {
            return data as RecordObject[];
        }

        if (typeof data === 'object') {
            return [data as RecordObject];
        }

        this.logger.warn('inMemory extractor: data must be an array or object', { stepKey: step.key });
        return [];
    }

    async extractGenerator(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { step } = context;
        const cfg = getExtractConfig<GeneratorExtractConfig>(step);

        const count = Number(cfg.count) || 10;
        const template = cfg.template;
        const records: RecordObject[] = [];

        for (let i = 0; i < count; i++) {
            const record = this.generateRecord(i, template);
            records.push(record);
        }

        this.logger.debug('Generated test records', { stepKey: step.key, count: records.length });
        return records;
    }

    private generateRecord(index: number, template?: Record<string, unknown>): RecordObject {
        const record: Record<string, unknown> = { _index: index };

        if (template && typeof template === 'object') {
            for (const [key, generator] of Object.entries(template)) {
                record[key] = this.generateValue(generator, index);
            }
        } else {
            this.applyDefaultTemplate(record, index);
        }

        return record as RecordObject;
    }

    private applyDefaultTemplate(record: Record<string, unknown>, index: number): void {
        record.id = index + 1;
        record.name = `Item ${index + 1}`;
        record.value = Math.floor(Math.random() * 1000);
        record.createdAt = new Date().toISOString();
    }

    private generateValue(generator: unknown, index: number): unknown {
        if (typeof generator !== 'string') {
            return generator;
        }

        return this.handleStringGenerator(generator, index);
    }

    private handleStringGenerator(generator: string, index: number): unknown {
        switch (generator) {
            case 'uuid':
                return this.generateUuid();
            case 'timestamp':
                return Date.now();
            case 'isoDate':
                return new Date().toISOString();
            case 'index':
                return index;
            default:
                return this.handlePrefixedGenerator(generator, index);
        }
    }

    private handlePrefixedGenerator(generator: string, index: number): unknown {
        if (generator.startsWith('random:')) {
            return this.generateRandom(generator);
        }
        if (generator.startsWith('seq:')) {
            return this.generateSequence(generator, index);
        }
        // Return as literal value
        return generator;
    }

    private generateUuid(): string {
        return crypto.randomUUID();
    }

    private generateRandom(generator: string): number {
        const max = parseInt(generator.split(':')[1], 10) || 100;
        return Math.floor(Math.random() * max);
    }

    private generateSequence(generator: string, index: number): number {
        const start = parseInt(generator.split(':')[1], 10) || 1;
        return start + index;
    }
}

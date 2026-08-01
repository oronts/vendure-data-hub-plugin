import { describe, expect, it } from 'vitest';
import { RUN_STATUS } from '../../shared/constants/enums';
import { pipelineSchema } from '../api/schema/pipeline.schema';
import { QUEUE_NAMES } from './core';
import { RUN_STATUS_OPTIONS } from './enum-metadata';
import { RunStatus } from './enums';
import { HASH_ALGORITHM_OPTIONS, QUERY_TYPE_OPTIONS } from './adapter-schema-options';

const RUN_STATUSES = [
    'PENDING',
    'RUNNING',
    'PAUSED',
    'COMPLETED',
    'FAILED',
    'TIMEOUT',
    'CANCELLED',
    'CANCEL_REQUESTED',
] as const;

describe('runtime constants contract', () => {
    it('contains only job queues created by runtime services', () => {
        expect(QUEUE_NAMES).toEqual({
            RUN: 'data-hub.run',
            EVENT_TRIGGER_OUTBOX: 'data-hub.event-trigger-outbox',
            WEBHOOK_RETRY: 'data-hub.webhook-retry',
            REMOTE_SOURCE_ACKNOWLEDGEMENT: 'data-hub.remote-source-acknowledgement',
        });
    });

    it('keeps backend, shared, Dashboard metadata, and GraphQL run statuses aligned', () => {
        expect(Object.values(RunStatus)).toEqual(RUN_STATUSES);
        expect(Object.values(RUN_STATUS)).toEqual(RUN_STATUSES);
        expect(RUN_STATUS_OPTIONS.map(option => option.value)).toEqual(RUN_STATUSES);
        expect(pipelineSchema).not.toContain('QUEUED');
    });

    it('exposes only supported hash algorithms and export query modes', () => {
        expect(HASH_ALGORITHM_OPTIONS.map(option => option.value)).toEqual([
            'sha256',
            'sha512',
        ]);
        expect(QUERY_TYPE_OPTIONS.map(option => option.value)).toEqual([
            'all',
            'query',
        ]);
    });
});

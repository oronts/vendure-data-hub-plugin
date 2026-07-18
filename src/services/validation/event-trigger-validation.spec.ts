import { describe, expect, it } from 'vitest';
import { VENDURE_EVENT_TYPES, type JsonObject, type PipelineDefinition } from '../../../shared/types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { validateTrigger } from './trigger-validation';

function validateEvent(config: JsonObject): string[] {
    const definition: PipelineDefinition = {
        version: 1,
        steps: [{
            key: 'event',
            type: 'TRIGGER',
            config: { type: 'EVENT', ...config },
        }],
    };
    const issues: PipelineDefinitionIssue[] = [];
    validateTrigger(definition, issues, []);
    return issues.map(issue => issue.errorCode ?? '');
}

describe('EVENT trigger validation', () => {
    it.each(VENDURE_EVENT_TYPES)('accepts supported event %s', event => {
        expect(validateEvent({ event })).toEqual([]);
    });

    it.each(['product.*', 'ProductVariantEvent.updated', 'UnknownEvent'])(
        'rejects unsupported event selector %s',
        event => {
            expect(validateEvent({ event })).toContain('unsupported-event-type');
        },
    );

    it('rejects the old nested event object', () => {
        expect(validateEvent({ event: { event: 'ProductEvent' } })).toContain('missing-event-type');
    });

    it.each(['entityType', 'conditions', 'filter', 'debounceMs', 'batchSize', 'batchTimeoutMs'])(
        'rejects ignored option %s',
        field => {
            expect(validateEvent({ event: 'ProductEvent', [field]: 1 })).toContain(
                'unsupported-event-trigger-field',
            );
        },
    );
});

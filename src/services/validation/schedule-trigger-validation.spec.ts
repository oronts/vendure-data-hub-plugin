import { describe, expect, it } from 'vitest';
import type { JsonObject, PipelineDefinition } from '../../types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { validateTrigger } from './trigger-validation';

function validateSchedule(config: JsonObject): string[] {
    const definition: PipelineDefinition = {
        version: 1,
        steps: [{
            key: 'schedule',
            type: 'TRIGGER',
            config: { type: 'SCHEDULE', ...config },
        }],
    };
    const issues: PipelineDefinitionIssue[] = [];
    validateTrigger(definition, issues, []);
    return issues.map(issue => issue.errorCode ?? '');
}

describe('schedule trigger validation', () => {
    it('accepts cron and interval schedules as separate modes', () => {
        expect(validateSchedule({ cron: '0 12 * * 7', timezone: 'Europe/Berlin' })).toEqual([]);
        expect(validateSchedule({ intervalSec: 30 })).toEqual([]);
    });

    it('rejects missing or ambiguous schedule modes', () => {
        expect(validateSchedule({})).toContain('invalid-schedule-mode');
        expect(validateSchedule({ cron: '0 * * * *', intervalSec: 60 })).toContain('invalid-schedule-mode');
    });

    it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
        'rejects invalid interval %s',
        intervalSec => {
            expect(validateSchedule({ intervalSec })).toContain('invalid-schedule-interval');
        },
    );

    it('rejects invalid cron and timezone values', () => {
        expect(validateSchedule({ cron: '70 * * * *' })).toContain('invalid-cron-expression');
        expect(validateSchedule({ cron: '0 * * * *', timezone: 'Not/A_Zone' }))
            .toContain('invalid-schedule-timezone');
    });

    it.each(['schedule', 'startTime', 'endTime', 'maxConcurrent'])(
        'rejects disconnected schedule option %s',
        field => {
            expect(validateSchedule({ cron: '0 * * * *', [field]: 'unused' })).toContain(
                'unsupported-schedule-trigger-field',
            );
        },
    );
});

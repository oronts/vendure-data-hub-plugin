import { describe, expect, it } from 'vitest';
import { parseLogsRouteSearch } from './log-search';

describe('logs route search', () => {
    it('accepts a trimmed run ID', () => {
        expect(parseLogsRouteSearch({ runId: ' run-42 ' }))
            .toEqual({ runId: 'run-42' });
    });

    it('drops empty and non-string values', () => {
        expect(parseLogsRouteSearch({ runId: '  ' })).toEqual({});
        expect(parseLogsRouteSearch({ runId: ['run-42'] })).toEqual({});
        expect(parseLogsRouteSearch({ runId: 42 })).toEqual({});
    });
});

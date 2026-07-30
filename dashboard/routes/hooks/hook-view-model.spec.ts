import { describe, expect, it } from 'vitest';
import {
    filterHookEvents,
    getResponsiveHookGridClass,
    isHookStageConfigured,
} from './hook-view-model';

describe('hook view model', () => {
    it('treats only non-empty action arrays as configured stages', () => {
        expect(isHookStageConfigured([{ type: 'LOG' }])).toBe(true);
        expect(isHookStageConfigured([])).toBe(false);
        expect(isHookStageConfigured({ type: 'LOG' })).toBe(false);
        expect(isHookStageConfigured(undefined)).toBe(false);
    });

    it('turns backend grid metadata into compiled responsive layouts', () => {
        expect(getResponsiveHookGridClass('grid-cols-4')).toContain('xl:grid-cols-4');
        expect(getResponsiveHookGridClass('grid-cols-3')).toContain('xl:grid-cols-3');
        expect(getResponsiveHookGridClass('grid-cols-12')).toContain('xl:grid-cols-3');
    });

    it('filters event names case-insensitively and ignores surrounding input whitespace', () => {
        const events = [
            { name: 'PipelineStarted' },
            { name: 'PipelineFailed' },
            { name: null },
        ];

        expect(filterHookEvents(events, ' FAILED ')).toEqual([
            { name: 'PipelineFailed' },
        ]);
        expect(filterHookEvents(events, '   ')).toEqual(events);
    });
});

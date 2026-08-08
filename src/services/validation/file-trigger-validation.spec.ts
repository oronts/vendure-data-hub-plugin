import { describe, expect, it } from 'vitest';
import { FILE_WATCH } from '../../constants/defaults';
import type { JsonObject, PipelineDefinition } from '../../types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { validateTrigger } from './trigger-validation';

function validateFileSource(adapterCode?: string, fileWatchOverrides: JsonObject = {}): string[] {
    const steps: PipelineDefinition['steps'] = [{
        key: 'watch-files',
        type: 'TRIGGER',
        config: {
            type: 'FILE',
            fileWatch: {
                connectionCode: 'incoming-files',
                path: '/incoming',
                pattern: '*.csv',
                pollIntervalMs: 60_000,
                ...fileWatchOverrides,
            },
        },
    }];
    if (adapterCode !== undefined) {
        steps.push({
            key: 'read-file',
            type: 'EXTRACT',
            adapterCode,
            config: {},
        });
    }
    const definition: PipelineDefinition = {
        version: 1,
        steps,
        edges: adapterCode === undefined ? [] : [{ from: 'watch-files', to: 'read-file' }],
    };
    const issues: PipelineDefinitionIssue[] = [];
    validateTrigger(definition, issues, []);
    return issues.map(issue => issue.errorCode ?? '');
}

describe('file trigger source validation', () => {
    it.each(['ftp', 's3'])('accepts the %s remote-file extractor', adapterCode => {
        expect(validateFileSource(adapterCode)).toEqual([]);
    });

    it('rejects inline file extractors that cannot fetch a remote reference', () => {
        expect(validateFileSource('csv')).toContain('invalid-file-watch-extractor');
    });

    it('requires a directly connected remote-file extractor', () => {
        expect(validateFileSource()).toContain('missing-file-watch-extractor');
    });

    it.each(['events', 'debounceMs'])('rejects inert file option %s', field => {
        const value = field === 'events' ? ['CREATE'] : 500;
        expect(validateFileSource('ftp', { [field]: value })).toContain(
            'unsupported-file-trigger-field',
        );
    });

    it.each([
        ['pollIntervalMs', 30_000.5, 'invalid-poll-interval'],
        ['pollIntervalMs', FILE_WATCH.MAX_POLL_INTERVAL_MS + 1, 'invalid-poll-interval'],
        ['minFileAge', -1, 'invalid-min-file-age'],
        ['minFileAge', FILE_WATCH.MAX_FILE_AGE_SEC + 1, 'invalid-min-file-age'],
        ['recursive', 'yes', 'invalid-recursive'],
    ])('rejects invalid %s values', (field, value, errorCode) => {
        expect(validateFileSource('ftp', { [field]: value })).toContain(errorCode);
    });
});

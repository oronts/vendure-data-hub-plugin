import { describe, expect, it, vi } from 'vitest';
import { FILE_WATCH } from '../../constants/defaults';
import { TriggerType } from '../../constants/enums';
import type { PipelineDefinition } from '../../types';
import {
    buildFileWatcherConfig,
    fileWatcherConfigsEqual,
    findEnabledFileTriggers,
    getFileWatcherKey,
} from './file-watch-config';

const definition = (steps: PipelineDefinition['steps']): PipelineDefinition => ({
    version: 1,
    steps,
});

describe('file watcher configuration', () => {
    it('selects only enabled FILE trigger steps', () => {
        const result = findEnabledFileTriggers(definition([
            {
                key: 'active-file',
                type: 'TRIGGER',
                config: {
                    type: TriggerType.FILE,
                    fileWatch: {
                        connectionCode: 'warehouse-s3',
                        path: '/incoming',
                    },
                },
            },
            {
                key: 'disabled-file',
                type: 'TRIGGER',
                config: {
                    enabled: false,
                    type: TriggerType.FILE,
                    fileWatch: {
                        connectionCode: 'warehouse-s3',
                        path: '/disabled',
                    },
                },
            },
            {
                key: 'event',
                type: 'TRIGGER',
                config: { type: TriggerType.EVENT, event: 'ProductEvent' },
            },
            { key: 'load', type: 'LOAD', config: {} },
        ]));

        expect(result).toEqual([{
            triggerKey: 'active-file',
            config: {
                connectionCode: 'warehouse-s3',
                path: '/incoming',
            },
        }]);
    });

    it('normalizes limits and file-age units into a runtime config', () => {
        const warn = vi.fn();
        const result = buildFileWatcherConfig(
            '7',
            'catalog-import',
            '11',
            'incoming-file',
            {
                connectionCode: 'warehouse-s3',
                path: '/incoming',
                pattern: '*.csv',
                pollIntervalMs: FILE_WATCH.MIN_POLL_INTERVAL_MS - 1,
                minFileAge: 45,
                recursive: false,
            },
            warn,
        );

        expect(result).toEqual({
            pipelineId: '7',
            pipelineCode: 'catalog-import',
            revisionId: '11',
            triggerKey: 'incoming-file',
            connectionCode: 'warehouse-s3',
            path: '/incoming',
            pattern: '*.csv',
            pollIntervalMs: FILE_WATCH.MIN_POLL_INTERVAL_MS,
            minFileAge: 45_000,
            recursive: false,
            autoStart: true,
        });
        expect(warn).not.toHaveBeenCalled();
    });

    it('rejects incomplete source configuration with an actionable warning', () => {
        const warn = vi.fn();

        expect(buildFileWatcherConfig(
            '7',
            'catalog-import',
            '11',
            'incoming-file',
            { connectionCode: 'warehouse-s3', path: '' },
            warn,
        )).toBeNull();
        expect(buildFileWatcherConfig(
            '7',
            'catalog-import',
            '11',
            'incoming-file',
            { connectionCode: '', path: '/incoming' },
            warn,
        )).toBeNull();
        expect(warn.mock.calls).toEqual([
            ['FILE trigger missing path for pipeline catalog-import'],
            ['FILE trigger missing connectionCode for pipeline catalog-import'],
        ]);
    });

    it('keys watchers stably and restarts them when effective config changes', () => {
        const warn = vi.fn();
        const current = buildFileWatcherConfig(
            '7',
            'catalog-import',
            '11',
            'incoming-file',
            { connectionCode: 'warehouse-s3', path: '/incoming' },
            warn,
        );

        expect(current).not.toBeNull();
        expect(getFileWatcherKey('catalog-import', 'incoming-file')).toBe(
            'catalog-import:incoming-file',
        );
        expect(fileWatcherConfigsEqual(current!, { ...current! })).toBe(true);
        expect(fileWatcherConfigsEqual(current!, {
            ...current!,
            revisionId: '12',
        })).toBe(false);
        expect(fileWatcherConfigsEqual(current!, {
            ...current!,
            path: '/incoming/v2',
        })).toBe(false);
    });
});

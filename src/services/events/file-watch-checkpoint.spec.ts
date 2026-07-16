import { describe, expect, it } from 'vitest';
import { RunStatus } from '../../constants/enums';
import {
    createPendingFileRun,
    findNextEligibleFile,
    isTerminalFailureStatus,
    readFileWatchCheckpoint,
    writeFileWatchCheckpoint,
    type DiscoveredFile,
} from './file-watch-checkpoint';

const timestamp = new Date('2026-07-15T10:00:00.000Z');

function file(path: string, modifiedAt = timestamp): DiscoveredFile {
    return {
        path,
        name: path.split('/').pop() ?? path,
        modifiedAt,
        size: 100,
    };
}

describe('file-watch checkpoint state', () => {
    it('orders files with identical timestamps by path without skipping them', () => {
        const next = findNextEligibleFile(
            [file('/in/c.csv'), file('/in/a.csv'), file('/in/b.csv')],
            { modifiedAt: timestamp.toISOString(), path: '/in/a.csv' },
            new Date('2026-07-15T10:01:00.000Z'),
            0,
        );

        expect(next?.path).toBe('/in/b.csv');
    });

    it('keeps chronological ordering even when discovery order differs', () => {
        const next = findNextEligibleFile(
            [
                file('/in/newest.csv', new Date('2026-07-15T12:00:00.000Z')),
                file('/in/oldest.csv', new Date('2026-07-15T10:00:00.000Z')),
                file('/in/middle.csv', new Date('2026-07-15T11:00:00.000Z')),
            ],
            undefined,
            new Date('2026-07-15T13:00:00.000Z'),
            0,
        );

        expect(next?.path).toBe('/in/oldest.csv');
    });

    it('round-trips independent trigger state while preserving unrelated checkpoint data', () => {
        const pending = createPendingFileRun(file('/in/a.csv'));
        const data = writeFileWatchCheckpoint(
            { extractor: { cursor: 'page-2' } },
            'file-trigger',
            { pending },
        );

        expect(readFileWatchCheckpoint(data, 'file-trigger')).toEqual({ pending });
        expect(readFileWatchCheckpoint(data, 'another-trigger')).toEqual({});
        expect(data.extractor).toEqual({ cursor: 'page-2' });
    });

    it('fails closed when persisted FILE-watch state is malformed', () => {
        expect(() => readFileWatchCheckpoint(
            { fileWatchCheckpoints: { 'file-trigger': { pending: 'invalid' } } },
            'file-trigger',
        )).toThrow('Invalid pending FILE run');
    });

    it('ignores remote entries with invalid modification timestamps', () => {
        const next = findNextEligibleFile(
            [file('/in/invalid.csv', new Date('invalid')), file('/in/valid.csv')],
            undefined,
            new Date('2026-07-15T11:00:00.000Z'),
            0,
        );

        expect(next?.path).toBe('/in/valid.csv');
    });

    it('classifies only unsuccessful terminal statuses as retryable failures', () => {
        expect(isTerminalFailureStatus(RunStatus.FAILED)).toBe(true);
        expect(isTerminalFailureStatus(RunStatus.TIMEOUT)).toBe(true);
        expect(isTerminalFailureStatus(RunStatus.CANCELLED)).toBe(true);
        expect(isTerminalFailureStatus(RunStatus.COMPLETED)).toBe(false);
        expect(isTerminalFailureStatus(RunStatus.RUNNING)).toBe(false);
        expect(isTerminalFailureStatus(RunStatus.PAUSED)).toBe(false);
    });
});
